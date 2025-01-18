import { Fyo, t } from 'fyo';
import { Action } from 'fyo/model/types';
import { ModelNameEnum } from 'models/types';
import { Report } from 'reports/Report';
import { ColumnField, GroupedMap, ReportData, ReportRow } from 'reports/types';
import { QueryFilter } from 'utils/db/types';
import { safeParseFloat } from 'utils/index';
import getCommonExportActions from './commonExporter';
import { Field, FieldTypeEnum } from 'schemas/types';
import { DateTime } from 'luxon';
import { sumBy } from 'lodash';
import { RawValueMap } from 'fyo/core/types';


export class Receivable extends Report {
  static title = t`Receivable`;
  static reportName = 'receivable';
  usePagination = true;
  loading = false;

  ascending = false;
  private parties: string[] = [];
  private partyMap = {};

  fromDate?: string;
  toDate?: string;
  paymentType?: 'Pay' | 'Receive' = 'Receive';

  private _rawData: Report[] = [];
  private shouldRefresh = false;
  private partyType: string = 'Customer';

  constructor(fyo: Fyo) {
    super(fyo);
    this._setObservers();
  }

  async private _setObservers(): void {
    const listener = () => (this.shouldRefresh = true);
    this.fyo.doc.observer.on(`sync:${ModelNameEnum.Party}`, listener);
    this.fyo.doc.observer.on(`sync:${ModelNameEnum.SalesInvoice}`, listener);
    this.fyo.doc.observer.on(`sync:${ModelNameEnum.PurchaseInvoice}`, listener);
    this.fyo.doc.observer.on(`delete:${ModelNameEnum.SalesInvoice}`, listener);
    this.fyo.doc.observer.on(`delete:${ModelNameEnum.PurchaseInvoice}`, listener);
  }
  async private _getParties(): Promise<void> {
    this.partyMap = new Map();
    this.parties = (await this.fyo.db.getAllRaw(ModelNameEnum.Party, { fields: ['name', 'email', 'phone', 'address', 'role', 'currency'], filters: { role: ['in', [this.partyType, 'Both']] } })) as RawValueMap[];
    this.parties.forEach((p) => this.partyMap.set(p.name, p));
  }


  private _getGroupedMap(sort: boolean, groupBy?: string): GroupedMap {
    groupBy ??= 'name';

    if (sort) {
      this._rawData.sort((a, b) => (this.ascending ? +a.date! - +b.date! : +b.date! - +a.date!));
    }
    let total = 0;
    const map: GroupedMap = new Map();
    for (const entry of this._rawData) {
      const groupingKey = entry[groupBy];
      if (!map.has(groupingKey)) {
        map.set(groupingKey, []);
      }
      map.get(groupingKey)!.push(entry);
      total += entry.outstandingAmount.float;
    }
    map.set('totals', [
      {
        name: -2,
        party: t`Total`,
        outstandingAmount: total,
      },
    ]);
    return map;
  }

  private async _setRawData(): Promise<void> {
    const fields = ['*'];
    const salesInvoices = await this._getData('SalesInvoice');
    const purchaseINvoices = await this._getData('PurchaseInvoice');

    this._rawData = [];
    this.partyMap.forEach((p) => {
      let outstandingAmount = this.fyo.pesa(0);
      if (this.partyType === 'Customer') {
        if (salesInvoices.has(p.name)) {
          outstandingAmount = outstandingAmount.add(salesInvoices.get(p.name).float);
          console.log(outstandingAmount.float);
        }
        if (purchaseINvoices.has(p.name)) {
          outstandingAmount = outstandingAmount.sub(purchaseINvoices.get(p.name).float);
        }
      }else {
        if (purchaseINvoices.has(p.name)) {
          outstandingAmount = outstandingAmount.add(purchaseINvoices.get(p.name).float);
        }
        if (salesInvoices.has(p.name)) {
          outstandingAmount = outstandingAmount.sub(salesInvoices.get(p.name).float);
        }
      }
      if (outstandingAmount.float !== 0) {
        this._rawData.push({
          ...p,
          party: p.name,
          outstandingAmount,
        });
      }
    })
    console.log(salesInvoices);
  }

  private _setIndexOnEntries(map: GroupedMap): void {
    let i = 1;
    for (const key of map.keys()) {
      for (const entry of map.get(key)!) {
        entry.index = String(i++);
      }
    }
  }

  private _consolidateEntries(map: GroupedMap): Report[] {
    const entries: Report[] = [];
    for (const key of map.keys()) {
      entries.push(...map.get(key)!);
    }
    return entries;
  }

  private _convertEntriesToReportData(entries: Report[]): ReportData {
    return entries.map((entry) => this._getRowFromEntry(entry, this.columns));
  }

  private _getRowFromEntry(entry: Report, columns: ColumnField[]): ReportRow {
    if (entry.name === -3) {
      return {
        isEmpty: true,
        cells: columns.map((c) => ({
          rawValue: '',
          value: '',
          width: c.width ?? 1,
        })),
      };
    }

    const row: ReportRow = { cells: [] };
    for (const col of columns) {
      const align = col.align ?? 'left';
      const width = col.width ?? 1;
      const fieldname = col.fieldname;
      let value = entry[fieldname as keyof Report];
      const rawValue = value;

      if (value === null || value === undefined) {
        value = '';
      }

      if (value instanceof Date) {
        value = this.fyo.format(value, FieldTypeEnum.Date);
      }

      if (typeof value === 'number' && fieldname !== 'index') {
        value = this.fyo.format(value, FieldTypeEnum.Currency);
      }

      if (typeof value === 'boolean' && fieldname === 'reverted') {
        value = value ? t`Reverted` : '';
      } else {
        value = String(value);
      }

      if (fieldname === 'referenceType') {
        value = this.fyo.schemaMap[value]?.label ?? value;
      }

      row.cells.push({
        italics: entry.name === -1,
        bold: entry.name === -2,
        value,
        rawValue,
        align,
        width,
      });
    }

    return row;
  }

  async setReportData(filter?: string, force?: boolean): Promise<void> {
    this.loading = true;
    let sort = true;
    if (force || filter !== 'grouped' || this._rawData.length === 0) {
      await this._setRawData();
      sort = false;
    }
    const map = this._getGroupedMap(sort);
    this._setIndexOnEntries(map);
    this.reportData = this._convertEntriesToReportData(this._consolidateEntries(map));
    this.loading = false;
  }

  setDefaultFilters(): void {
    if (!this.toDate) {
      this.toDate = DateTime.now().plus({ days: 1 }).toISODate();
    }
  }

  getFilters(): Field[] {
    return [
      { fieldtype: 'Link', target: 'Party', label: t`Party`, placeholder: t`Party`, fieldname: 'party' },
      { fieldtype: 'Date', placeholder: t`To Date`, label: t`To Date`, fieldname: 'toDate' },
      // { fieldtype: 'Check', label: t`Ascending Order`, fieldname: 'ascending' },
    ];
  }

  getColumns(): ColumnField[] {
    return [
      { label: '#', fieldtype: 'Int', fieldname: 'index', align: 'right', width: 0.5 },
      { label: t`Party`, fieldtype: 'Link', fieldname: 'party' },
      { label: t`Email`, fieldtype: 'Data', fieldname: 'email', width: 1.25 },
      { fieldname: 'phone', label: 'Phone', fieldtype: 'Data' },
      { fieldname: 'address', label: 'Address', fieldtype: 'Data' },
      { fieldname: 'outstandingAmount', label: 'Outstanding Amount', fieldtype: 'Currency' },
      { fieldname: 'currency', label: 'Currency', fieldtype: 'Data' },
    ];
  }

  getActions(): Action[] {
    return getCommonExportActions(this);
  }

  private async _getQueryFilters(): Promise<QueryFilter> {
    const filters: QueryFilter = {};
    const stringFilters = ['party'];

    for (const sf of stringFilters) {
      const value = this[sf];
      if (value === undefined) {
        continue;
      }

      filters[sf] = value as string;
    }
    if (this.to) {
      filters.date ??= [];
      filters.date.push(['<=', this.to]);
    }
    await this._getParties();
    Object.assign(filters, {
      submitted: true,
      cancelled: false,
      party: ['in', Array.from(this.partyMap.keys())],
      outstandingAmount: ['>', 0],
    })
    return filters;
  }
  async _getData(
    schemaName: 'SalesInvoice' | 'PurchaseInvoice'
  ) {
    const filters = await this._getQueryFilters();
    const outstandingAmounts = await this.fyo.db.getAllRaw(schemaName, {
      fields: ['party', 'outstandingAmount'],
      filters: filters,
    });
    let entries = new Map() as Map<string, Report[]>;
    for (const entry of outstandingAmounts) {
      if (entry.outstandingAmount <= 0) {
        continue;
      }
      if (entries.has(entry.party)) {
        entries.get(entry.party)?.add(entry.outstandingAmount);
      } else {
        entries.set(entry.party, this.fyo.pesa(entry.outstandingAmount));
      }
    }
    console.log(entries);
    return entries;
  }
}

