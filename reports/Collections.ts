import { Fyo, t } from 'fyo';
import { Action } from 'fyo/model/types';
import { ModelNameEnum } from 'models/types';
import { Report } from 'reports/Report';
import { ColumnField, GroupedMap, ReportData, ReportRow } from 'reports/types';
import { QueryFilter } from 'utils/db/types';
import { safeParseFloat, safeParseInt } from 'utils/index';
import getCommonExportActions from './commonExporter';
import { Field, FieldTypeEnum } from 'schemas/types';
import { DateTime } from 'luxon';

type GroupByKey = 'account' | 'party' | 'referenceName' | 'name' | 'none';

export class Collections extends Report {
  static title = t`Collections`;
  static reportName = 'collections';
  usePagination = true;
  loading = false;

  groupBy?: GroupByKey;
  ascending = false;

  fromDate?: string;
  toDate?: string;
  paymentType?: 'Pay' | 'Receive' = 'Receive';

  private _rawData: Report[] = [];
  private shouldRefresh = false;

  constructor(fyo: Fyo) {
    super(fyo);
    this._setObservers();
  }

  private _setObservers(): void {
    const listener = () => (this.shouldRefresh = true);

    this.fyo.doc.observer.on(`sync:${ModelNameEnum.Payment}`, listener);
    this.fyo.doc.observer.on(`delete:${ModelNameEnum.Payment}`, listener);
  }

  private _getGroupByKey(): GroupByKey {
    return this.groupBy && this.groupBy !== 'none' ? this.groupBy as GroupByKey : 'name';
  }

  private _getGroupedMap(sort: boolean, groupBy?: GroupByKey): GroupedMap {
    groupBy ??= this._getGroupByKey();

    if (sort) {
      this._rawData.sort((a, b) => (this.ascending ? +a.date! - +b.date! : +b.date! - +a.date!));
    }

    const map: GroupedMap = new Map();
    for (const entry of this._rawData) {
      const groupingKey = entry[groupBy];
      if (!map.has(groupingKey)) {
        map.set(groupingKey, []);
      }
      map.get(groupingKey)!.push(entry);
    }

    return map;
  }

  private async _setRawData(): Promise<void> {
    const fields = ['*'];
    const filters = await this._getQueryFilters();
    const entries = (await this.fyo.db.getAllRaw(ModelNameEnum.Payment, {
      fields,
      filters,
      orderBy: ['date', 'created'],
      order: this.ascending ? 'asc' : 'desc',
    })) as Report[];

    this._rawData = entries.map((entry) => ({
      ...entry,
      account: entry.account,
      date: new Date(entry.date),
      amount: Math.abs(safeParseFloat(entry.amount)),
      party: entry.party,
      reverted: Boolean(entry.reverted),
      reverts: entry.reverts,
      referenceDate: entry.referenceDate?new Date(entry.referenceDate): '',
    }));
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
      this.fromDate = DateTime.now().minus({ years: 1 }).toISODate();
    }
  }

  getFilters(): Field[] {
    return [
      { fieldtype: 'Link', target: 'Party', label: t`Party`, placeholder: t`Party`, fieldname: 'party' },
      { fieldtype: 'Date', placeholder: t`From Date`, label: t`From Date`, fieldname: 'fromDate' },
      { fieldtype: 'Date', placeholder: t`To Date`, label: t`To Date`, fieldname: 'toDate' },
      { fieldtype: 'Check', label: t`Include Cancelled`, fieldname: 'reverted' },
      { fieldtype: 'Check', label: t`Ascending Order`, fieldname: 'ascending' },
    ];
  }

  getColumns(): ColumnField[] {
    return [
      { label: '#', fieldtype: 'Int', fieldname: 'index', align: 'right', width: 0.5 },
      { label: t`Date`, fieldtype: 'Date', fieldname: 'date' },
      { label: t`Payment No`, fieldtype: 'Link', fieldname: 'name', target: 'Payment', width: 1.5 },
      { label: t`Party`, fieldtype: 'Link', fieldname: 'party' },
      { label: t`Payment Method`, fieldtype: 'Link', fieldname: 'paymentMethod', target: 'PaymentMethod', width: 1.25 },
      { fieldname: 'account', label: 'From Account', fieldtype: 'Link', target: 'Account' },
      { fieldname: 'clearanceDate', label: 'Clearance Date', placeholder: 'Clearance Date', fieldtype: 'Date' },
      { fieldname: 'referenceId', label: 'Ref. / Cheque No.', placeholder: 'Ref. / Cheque No.', fieldtype: 'Data' },
      { fieldname: 'referenceDate', label: 'Reference Date', placeholder: 'Ref. Date', fieldtype: 'Date' },
      { fieldname: 'amount', label: 'Amount', fieldtype: 'Currency' },
    ];
  }

  getActions(): Action[] {
    return getCommonExportActions(this);
  }

  private async _getQueryFilters(): Promise<QueryFilter> {
    const filters: QueryFilter = {};
    if (this.from) {
      filters.date ??= [];
      filters.date.push(['>=', this.from]);
    }
    if (this.to) {
      filters.date ??= [];
      filters.date.push(['<=', this.to]);
    }
    filters.paymentType = this.paymentType;
    console.log(filters)
    return filters;
  }
}

