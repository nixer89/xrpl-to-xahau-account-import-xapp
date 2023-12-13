import { Encode } from 'xrpl-tagged-address-codec';
import { XummTypes } from 'xumm-sdk';
import { verifySignature } from 'verify-xrpl-signature'

export function isValidXRPAddress(address: string): boolean {
    try {
      if(address) {
        //console.log("encoding address: " + address);
        let xAddress = Encode({account: address});
        //console.log("xAddress: " + xAddress);
        return xAddress && xAddress.length > 0;
      } else {
        return false
      }
    } catch(err) {
      //no valid address
      //console.log("err encoding " + err);
      return false;
    }
}

export function basicPayloadInfoValidation(payloadInfo: XummTypes.XummGetPayloadResponse): boolean {
  return payloadInfo && payloadInfo.meta && payloadInfo.payload && payloadInfo.response
      && payloadInfo.meta.exists && payloadInfo.meta.resolved && payloadInfo.meta.signed;
}

export function successfullSignInPayloadValidation(payloadInfo: XummTypes.XummGetPayloadResponse): boolean {
  if(basicPayloadInfoValidation(payloadInfo) && 'signin' === payloadInfo.payload.tx_type.toLowerCase() && payloadInfo.response.txid && payloadInfo.response.hex && payloadInfo.response.account) {
      //validate signature
      return verifySignature(payloadInfo.response.hex).signatureValid;
  } else {
      return false;
  }
}

export function successfullAccountSetPayloadValidation(payloadInfo: XummTypes.XummGetPayloadResponse): boolean {
  if(basicPayloadInfoValidation(payloadInfo) && 'accountset' === payloadInfo.payload.tx_type.toLowerCase() && payloadInfo.meta.submit && payloadInfo.response.dispatched_result === 'tesSUCCESS') {
      //validate signature
      return verifySignature(payloadInfo.response.hex).signatureValid
  } else {
      return false;
  }
}

export function successfullRegularKeyPayloadValidation(payloadInfo: XummTypes.XummGetPayloadResponse): boolean {
  if(basicPayloadInfoValidation(payloadInfo) && 'setregularkey' === payloadInfo.payload.tx_type.toLowerCase()) {
      //validate signature
      return verifySignature(payloadInfo.response.hex).signatureValid
  } else {
      return false;
  }
}

export function successfullImportPayloadValidation(payloadInfo: XummTypes.XummGetPayloadResponse): boolean {
  let basic = basicPayloadInfoValidation(payloadInfo);

  if(basic) {
    if('import' === payloadInfo.payload.tx_type.toLowerCase() && payloadInfo.meta.submit && payloadInfo.response.dispatched_result === 'tesSUCCESS') {
        //submit successfull and also validated.
        return true;
        //validate signature
        //let verifiedSignature = verifySignature(payloadInfo.response.hex);
        //console.log("verifiedSignature: " + verifiedSignature);
        //return verifiedSignature.signatureValid;
    } else {
      console.log("SECOND STAGE FAILED")
        return false;
    }
  } else {
    console.log("BASIC FAILED!");
    return false;
  }
}



