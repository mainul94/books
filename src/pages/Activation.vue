<template>
  <div>
    <p v-show="error" class="mt-2 text-red-600 text-2xl">{{ error }}</p>
    <FormControl ref="controls" :df="df" :value="licenseKey" :text-end="false"
    :class="'min-w-80 bordered'"
      @change="async (value) => await onChange(value)"></FormControl>
    <div class="mt-6 text-right">
        <Button @click="validateLicenseKey">{{ t`Active` }}</Button>
    </div>
  </div>
</template>

<script setup>
import router from 'src/router';
import { validateLicense } from 'src/utils/activation';
import { ref } from 'vue';
import FormControl from 'src/components/Controls/FormControl.vue';
import Button from 'src/components/Button.vue';

const licenseKey = ref('');
const error = ref('');
const df = {
  fieldname: 'linceseKey',
  fieldtype: 'Data',
  label: 'License Key',
  placeholder: 'Enter your license key here',
  required: true
}


const validateLicenseKey = () => {
  if (!licenseKey.value) return;
  const resonse = validateLicense(licenseKey.value);
  if (resonse==='activated') {
    error.value = '';
    window.location.reload();
  }else if (resonse==="expired") {
    error.value = 'Your license key has been expired, Please renew your license key.';
  }else if (resonse==="conflict") {
    error.value = 'Your license key is already in use by another user, Please enter a valid lincense key.';
  }
  else {
    error.value = 'Invalid license key, Please enter a valid lincense key.';
  }
};

const onChange = async (value) => {
  licenseKey.value = value;
};

</script>