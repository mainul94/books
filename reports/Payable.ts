import { Receivable } from "./Receivable";
import { t } from "fyo";


export class Payable extends Receivable {
  static title = t`Payable`;
  static reportName = 'payable';
  paymentType?: 'Pay' | 'Receive' = 'Pay';
  private partyType: string = 'Supplier';
}