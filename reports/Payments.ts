
import { t } from 'fyo';
import { Collections } from './Collections';


export class Payments extends Collections {
  static title = t`Payment`
  static reportName = 'payments'
  paymentType = 'Pay'
}

