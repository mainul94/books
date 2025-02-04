import FingerprintJS from '@fingerprintjs/fingerprintjs';
import CryptoJS from 'crypto-js';
import { fyo } from 'src/initFyo';
import axios from 'axios';

const getDeviceId = async (): Promise<string> => {
  const fp = await FingerprintJS.load();
  const { visitorId } = await fp.get();

  return visitorId;
};

const getEncryptionKey = getDeviceId;

/**
 * Validate the license during app startup.
 */
const validateLicenseExpiry = async (): Promise<boolean> => {
  const licenseKey = fyo.singles.SystemSettings?.licenseKey;
  const validUntil = fyo.singles.SystemSettings?.validUntil;
  if (!(licenseKey && validUntil)) {
    return false;
  }
  const secretKey = await getEncryptionKey();
  const bytes = CryptoJS.AES.decrypt(validUntil, secretKey);
  const validUntilDate = bytes.toString(CryptoJS.enc.Utf8);
  if (new Date() > new Date(validUntilDate)) {
    return false;
  }
  return true;
};

const validateLicense = async (key: string): Promise<any> => {
  const response  = await axios.post(`https://cloudycamp.com/api/method/license_management.api.activate_license`, {license_key:key, device_uuid:await getDeviceId()});
  console.log(response);
  if (response.status !== 200) {
    return response;
  }
  if (response.data.message.status === 'activated') {
    const doc = await fyo.doc.getDoc('SystemSettings');
    doc.licenseKey = key;
    const secretKey = await getEncryptionKey();
    doc.validUntil = CryptoJS.AES.encrypt(response.data.message.expiration_date, secretKey).toString();
    await doc.sync();
    ipc.reloadWindow();
    return response.data.message.status;
  } else if (response.data.message.status) {
    return response.data.message.status;
  }
  return false;
};

export { getDeviceId, validateLicenseExpiry, validateLicense };
