import { Component, ViewChild, OnInit, Input, OnDestroy } from '@angular/core';
import { isValidXRPAddress, successfullAccountSetPayloadValidation, successfullImportPayloadValidation, successfullRegularKeyPayloadValidation, successfullSignInPayloadValidation } from './utils/utils';
import { isMasterKeyDisabled } from './utils/flagutils';
import { MatStepper } from '@angular/material/stepper';
import { XRPLWebsocket } from './services/xrplWebSocket';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription, Observable } from 'rxjs';
import { OverlayContainer } from '@angular/cdk/overlay';
import { TypeWriter } from './utils/TypeWriter';
import { XahauWebsocket } from './services/xahauWebSocket';
import { AppService } from './services/app.service';
import * as clipboard from 'copy-to-clipboard';
import { XummPostPayloadBodyJson, XummPostPayloadResponse } from 'xumm-sdk/dist/src/types';
import { XummWebsocketResponse } from './utils/types';
import { Xumm } from 'xumm';
import { decode } from 'ripple-binary-codec';
import { deriveAddress } from 'ripple-keypairs';

@Component({
  selector: 'xahauimport',
  templateUrl: './xahauimport.html',
  styleUrls: ['./xahauimport.css']
})
export class XahauImportComponent implements OnInit, OnDestroy {

  constructor(private xrplWebSocket: XRPLWebsocket,
              private xahauWebSocket: XahauWebsocket,
              private app: AppService,
              private snackBar: MatSnackBar,
              private overlayContainer: OverlayContainer) { }


  @ViewChild('importStepper') stepper: MatStepper;

  @Input()
  themeChanged: Observable<any>;

  originalAccountInfo:any;

  xrplAccountHasRegularKey:boolean = false;
  regularKeyAccount:string = null;
  isMasterKeyDisabled:boolean = false;

  xrplAccountHasSignerList:boolean = false;

  signingAccountForImport:string = null;

  xahauAccountInfo:any;

  testMode:boolean = false;

  force_xrpl_main:string = "MAINNET";
  force_xrpl_test:string = "TESTNET";
  force_xahau_main:string = "XAHAU";
  force_xahau_test:string = "XAHAUTESTNET";

  burnSuccess:boolean = false;
  burn_tx_hash:string = null;
  burnErrorLabel:string = null;
  
  importSuccess:boolean = false;
  import_tx_hash:string = null;
  importErrorLabel:string = null;

  errorBlob:boolean = false;
  
  xummMajorVersion:number = null;
  xummMinorVersion:number = null;

  private themeReceived: Subscription;

  loadingData:boolean = true;

  infoLabel:string = null;

  title: string = "Xahau Services xApp";
  tw: TypeWriter

  themeClass = 'dark-theme';
  backgroundColor = '#000000';

  errorLabel:string = null;

  accountReserve:number = 10000000;
  ownerReserve:number = 2000000;

  termsAndConditions:boolean = false;

  xummOutdated:boolean = false;

  //xummClient:Xumm = new Xumm("231fcc40-ce96-49cf-a07f-3c84cd7194bc");

  xummClient:Xumm;

  //app loaded, to other stuff now!

  async ngOnInit() {

    this.xummClient = window['xummClient'];

    this.themeReceived = this.themeChanged.subscribe(async appStyle => {

      this.themeClass = appStyle.theme;
      this.backgroundColor = appStyle.color;

      var bodyStyles = document.body.style;
      bodyStyles.setProperty('--background-color', this.backgroundColor);
      this.overlayContainer.getContainerElement().classList.remove('dark-theme');
      this.overlayContainer.getContainerElement().classList.remove('light-theme');
      this.overlayContainer.getContainerElement().classList.remove('moonlight-theme');
      this.overlayContainer.getContainerElement().classList.remove('royal-theme');
      this.overlayContainer.getContainerElement().classList.add(this.themeClass);

      console.log("TEST 2");
    });

    
    let start = Date.now();

    let pong = await this.xummClient.ping();
    console.log("pong: " + JSON.stringify(pong));

    let ottData = await this.xummClient.environment.ott;

    console.log(ottData);

    this.testMode = (ottData.nodetype == 'TESTNET' || ottData.nodetype == 'XAHAUTESTNET');

    if(ottData.version) {
      let version:string[] = ottData.version.split('.');
      this.xummMajorVersion = Number.parseInt(version[0]);
      this.xummMinorVersion = Number.parseInt(version[1]);

      if(this.xummMajorVersion < 2 || (this.xummMajorVersion == 2 && this.xummMinorVersion < 6)) {
        this.xummOutdated = true;
        console.log("XUMM IS OUTDATED: " + ottData.version);
      } else {
        if(ottData && ottData.account && ottData.accountaccess === 'FULL') {

          //load account data
          await Promise.all([
            this.loadXrplAccountData(ottData.account),
            this.loadXahauAccountData(ottData.account)
          ]);
  
          //await this.loadAccountData(ottData.account); //false = ottResponse.node == 'TESTNET' 
        } else {
          this.originalAccountInfo = "no account";
        }
      }
    }

    this.tw = new TypeWriter(["Xahau Services xApp", "created by nixerFFM", "Xahau Services xApp"], t => {
      this.title = t;
    })

    this.loadingData = false;
    let readyResult = await this.xummClient.xapp.ready();
    console.log("READY RESULT: " + readyResult);

    let end = Date.now();

    console.log("LOADING ALL: " + (end-start) + " ms.");

    this.tw.start();
    //this.infoLabel = JSON.stringify(this.device.getDeviceInfo());
  }

  ngOnDestroy() {
    if(this.themeReceived)
      this.themeReceived.unsubscribe();
  }

  async loadXrplAccountData(xrplAccount: string) {
    try {
      //this.infoLabel = "loading " + xrplAccount;
      if(xrplAccount && isValidXRPAddress(xrplAccount)) {
        this.loadingData = true;
        
        let account_info_request = {
          command: "account_info",
          account: xrplAccount,
          signer_lists: true,
          "strict": true,
        }

        let message_acc_info:any = await this.xrplWebSocket.getWebsocketMessage("xrpl", account_info_request, this.testMode);
        //console.log("xrpl-transactions account info: " + JSON.stringify(message_acc_info));
        //this.infoLabel = JSON.stringify(message_acc_info);
        if(message_acc_info && message_acc_info.status && message_acc_info.type && message_acc_info.type === 'response') {
          if(message_acc_info.status === 'success' && message_acc_info.result && message_acc_info.result.account_data) {
            this.originalAccountInfo = message_acc_info.result.account_data;
            this.xrplAccountHasRegularKey = isValidXRPAddress(this.originalAccountInfo.RegularKey),
            this.xrplAccountHasSignerList = this.originalAccountInfo.signer_lists && this.originalAccountInfo.signer_lists.length > 0;

            if(this.xrplAccountHasRegularKey) {
              this.regularKeyAccount = this.originalAccountInfo.RegularKey;
            } else {
              this.regularKeyAccount = null;
            }

            this.isMasterKeyDisabled = isMasterKeyDisabled(this.originalAccountInfo.Flags);

            console.log("this.xrplAccountHasRegularKey: " + this.xrplAccountHasRegularKey);
            console.log("this.xrplAccountHasSignerList: " + this.xrplAccountHasSignerList);
            console.log("this.isMasterKeyDisabled: " + this.isMasterKeyDisabled);
            console.log("originalAccountInfo:")
            console.log(this.originalAccountInfo);
          } else {
            this.originalAccountInfo = message_acc_info;
            
          }
        } else {
          this.originalAccountInfo = "no account";
        }
      } else {
        this.originalAccountInfo = "no account"
      }
    } catch(err) {
      this.handleError(err);
    }
  }

  async loadXahauAccountData(xahauAccount: string) {
    try {
      //this.infoLabel = "loading " + xrplAccount;
      if(xahauAccount && isValidXRPAddress(xahauAccount)) {
        this.loadingData = true;
        
        let account_info_request:any = {
          command: "account_info",
          account: xahauAccount,
          "strict": true,
        }

        let message_acc_info:any = await this.xahauWebSocket.getWebsocketMessage("xahau", account_info_request, this.testMode);
        //console.log("xrpl-transactions account info: " + JSON.stringify(message_acc_info));
        //this.infoLabel = JSON.stringify(message_acc_info);
        if(message_acc_info && message_acc_info.status && message_acc_info.type && message_acc_info.type === 'response') {
          if(message_acc_info.status === 'success' && message_acc_info.result && message_acc_info.result.account_data) {
            this.xahauAccountInfo = message_acc_info.result.account_data;
            console.log("xahauAccountInfo:")
            console.log(this.xahauAccountInfo);
          } else {
            this.xahauAccountInfo = message_acc_info;
            
          }
        } else {
          this.xahauAccountInfo = "no account";
        }
      } else {
        this.xahauAccountInfo = "no account"
      }
    } catch(err) {
      this.handleError(err);
    }
  }

  async changeAccount() {
    this.loadingData = true;

    console.log("CHANGE ACCOUNT PRESSED");

    
    try {
      let signinPayload = await this.xummClient.payload.create({
        txjson: {
          TransactionType: "SignIn"
        }
      });

      console.log("CREATED SIGN REQUEST");

      let websocketResult = await this.awaitSignResult(signinPayload);

      console.log("GOT RESULT:");
      console.log(websocketResult);

      if(websocketResult && websocketResult.signed) {
        //payload was resolved. check it!
        let resolvedPayload = await this.xummClient.payload.get(signinPayload.uuid);

        console.log("PAYLOAD:");
        console.log(resolvedPayload);

        if(resolvedPayload && successfullSignInPayloadValidation(resolvedPayload)) {
          await Promise.all([
            this.loadXrplAccountData(resolvedPayload.response.account),
            this.loadXahauAccountData(resolvedPayload.response.account)
          ]);
        }
      }

    } catch(err) {
      this.handleError(err);
    }

    this.loadingData = false;
  
  }

  async executeBurnTransaction() {

    this.loadingData = true;

    try {

      let burnPayloadRequest = null;

      if(this.xrplAccountHasRegularKey && this.regularKeyAccount) {
        burnPayloadRequest = {
          txjson: {
            TransactionType: "SetRegularKey",
            Account: this.originalAccountInfo.Account,
            RegularKey: this.regularKeyAccount,
            OperationLimit: this.testMode ? 21338 : 21337
          },
          options: {
            signers: [this.originalAccountInfo.Account],
            submit: false,
            force_network: this.testMode ? this.force_xrpl_test : this.force_xrpl_main
          }
        }
      } else { // use AccountSet transaction!
        burnPayloadRequest = {
          txjson: {
            TransactionType: "AccountSet",
            Account: this.originalAccountInfo.Account,
            OperationLimit: this.testMode ? 21338 : 21337
          },
          options: {
            signers: [this.originalAccountInfo.Account],
            submit: true,
            force_network: this.testMode ? this.force_xrpl_test : this.force_xrpl_main
          }
        }
      }

      console.log("BURN REQUEST:")
      console.log(burnPayloadRequest);

      let burnPayloadResponse = await this.xummClient.payload.create(burnPayloadRequest);

      console.log("GOT BURN RESPONSE");
      console.log(burnPayloadResponse);

      if(burnPayloadResponse && burnPayloadResponse.uuid) {

        let websocketResult = await this.awaitSignResult(burnPayloadResponse);

        console.log("GOT RESULT:");
        console.log(websocketResult);

        if(websocketResult && websocketResult.signed) {
          //payload was resolved. check it!
          let resolvedPayload = await this.xummClient.payload.get(burnPayloadResponse.uuid);

          console.log("PAYLOAD:");
          console.log(resolvedPayload);

          if(resolvedPayload.payload.tx_type === 'SetRegularKey') {
            //we have a SetRegularKey transaction. check signed hex and submit if all ok
            if(successfullRegularKeyPayloadValidation(resolvedPayload)) {
              let trxBlob = resolvedPayload.response.hex;
              let decodedHex = decode(trxBlob);
              let signerAddress = deriveAddress(decodedHex.SigningPubKey);

              console.log("DECODED HEX:");
              console.log(decodedHex);

              console.log("SIGNER ACCOUNT: " + signerAddress);

              if(decodedHex.RegularKey === this.regularKeyAccount && decodedHex.Account === this.originalAccountInfo.Account && isValidXRPAddress(signerAddress) && (this.originalAccountInfo.Account === signerAddress || this.regularKeyAccount === signerAddress)) { //same regular key + valid address and signer = current regular key account or master account
                //submit trx to the XRPL
                let submit_tx = {
                  command: "submit",
                  tx_blob: trxBlob,
                  fail_hard: true
                }

                console.log("SUBMIT:")
                console.log(submit_tx)

                let submitTrxResponse = await this.xrplWebSocket.getWebsocketMessage("xrpl", submit_tx, this.testMode);

                console.log("TRANSACTION SUBMIT RESPONSE:")
                console.log(JSON.stringify(submitTrxResponse));

                if(submitTrxResponse && submitTrxResponse.result?.engine_result === 'tesSUCCESS') {
                  //wait 4 seconds to it to be validated
                  await new Promise((resolve) => {setTimeout(resolve, 5000)});

                  let tx_request = {
                    command: "tx",
                    transaction: resolvedPayload.response.txid,
                    binary: false
                  }

                  console.log("CHECK:")
                  console.log(tx_request)

                  let txResponse = await this.xrplWebSocket.getWebsocketMessage("xrpl", tx_request, this.testMode);

                  if(!txResponse?.result?.validated) {
                    //wait another few seconds
                    await new Promise((resolve) => {setTimeout(resolve, 3000)});

                    txResponse = await this.xrplWebSocket.getWebsocketMessage("xrpl", tx_request, this.testMode);

                    if(!txResponse?.result?.validated) {
                      //wait another few seconds
                      await new Promise((resolve) => {setTimeout(resolve, 3000)});
  
                      txResponse = await this.xrplWebSocket.getWebsocketMessage("xrpl", tx_request, this.testMode);
                    }
                  }

                  console.log("TRANSACTION CHECK RESPONSE:")
                  console.log(JSON.stringify(txResponse));

                  if(txResponse && txResponse.result?.meta?.TransactionResult === 'tesSUCCESS' && txResponse.result?.Account === this.originalAccountInfo.Account && txResponse.result?.SigningPubKey === decodedHex.SigningPubKey) {
                    this.burnSuccess = true;
                    this.burn_tx_hash = resolvedPayload.response.txid;
                    this.signingAccountForImport = signerAddress;
                  } else {
                    console.log("Transaction could not be verified")
                    this.burnSuccess = false;
                    this.burn_tx_hash = "abc";
                  }
                } else {
                  this.burnSuccess = false;
                  this.burn_tx_hash = "abc";
                }
              } else {
                console.log("Transaction signer: '"+ signerAddress + "' does not match expected signer: '" + this.signingAccountForImport + "'");
                this.burnSuccess = false;
                this.burn_tx_hash = "abc";

                if(this.originalAccountInfo.Account === signerAddress || this.regularKeyAccount === signerAddress) {
                  this.burnErrorLabel = "Expected transaction does not match signed transaction. Not submitting transaction to the XRP Ledger."
                } else {
                  this.burnErrorLabel = "Transaction signer: '"+ signerAddress + "' does not match expected signer: '" + this.signingAccountForImport + "'. Not submitting transaction. Please try again."
                }
              }
            } else {
              console.log("SIGNATURE INVALID");
              this.burnSuccess = false;
              this.burn_tx_hash = "abc";
              this.burnErrorLabel = "Transaction signature invalid. Please try again."
            }

          } else if(resolvedPayload && successfullAccountSetPayloadValidation(resolvedPayload)) {
            this.burnSuccess = true;
            this.burn_tx_hash = resolvedPayload.response.txid;
            this.signingAccountForImport = resolvedPayload.response.account;
          } else {
            this.burnSuccess = false;
            this.burn_tx_hash = resolvedPayload.response.txid || "abc";
          }
        } else {
          this.burnSuccess = false;
          this.burn_tx_hash = "abc";
          if(websocketResult.declined)
            this.burnErrorLabel = "You declined the sign request.";
          else if(websocketResult.expired)
            this.burnErrorLabel = "The sign request has expired. Please try again.";
        }
      } else {
        throw "Error creating Burn payload for account: " + this.originalAccountInfo.Account;
      }
    } catch(err) {
      console.log(err);
      this.handleError(err);
    }

    this.loadingData = false;
  }

  async importTransaction() {

    this.loadingData = true;

    try {
      //fetch xpop
      let blob:string = null;
      
      if(!this.testMode) {
        try {
          blob = await this.app.getText("https://xpop.xrpldata.com/xpop/"+this.burn_tx_hash);
        } catch(err) {
          console.log(err);
        }
      }

      if(!blob) {
        //try different server
        try {
          blob = await this.app.getText("https://xpop.xrpl-labs.com/xpop/"+this.burn_tx_hash);
        } catch(err) {
          console.log(err);
        }
      }
      
      if(blob) {

        this.errorBlob = false;

        let importPayloadRequest:XummPostPayloadBodyJson = {
          txjson: {
            TransactionType: "Import",
            Fee: 0,
            Sequence: this.xahauAccountInfo.Sequence ? this.xahauAccountInfo.Sequence : 0,
            NetworkID: this.testMode ? 21338 : 21337,
            Blob: blob.toUpperCase()
          },
          options: {
            signers: [this.signingAccountForImport],
            submit: true,
            force_network: this.testMode ? this.force_xahau_test : this.force_xahau_main
          }
        };

        console.log("IMPORT REQUEST:")
        console.log(importPayloadRequest);

        let importPayloadResponse = await this.xummClient.payload.create(importPayloadRequest);
  
        console.log("IMPORT CREATE PAYLOAD RESPONSE");

        console.log(JSON.stringify(importPayloadResponse));
  
        let websocketResult = await this.awaitSignResult(importPayloadResponse);
  
        console.log("GOT RESULT:");
        console.log(websocketResult);
  
        if(websocketResult && websocketResult.signed) {
          //payload was resolved. check it!
          let resolvedPayload = await this.xummClient.payload.get(importPayloadResponse.uuid);
  
          console.log("PAYLOAD:");
          console.log(resolvedPayload);

          if(resolvedPayload && successfullImportPayloadValidation(resolvedPayload)) {
            this.importErrorLabel = null;
            this.importSuccess = true;
            this.import_tx_hash = resolvedPayload.response.txid;
          } else {
            this.importSuccess = false;
            this.import_tx_hash = resolvedPayload.response.txid || "abc";

            let trxBlob = resolvedPayload.response.hex;
            let decodedHex = decode(trxBlob);
            let signerAddress = deriveAddress(decodedHex.SigningPubKey);

            if(this.signingAccountForImport != signerAddress) {
              this.importErrorLabel = "Transaction signer: '"+ signerAddress + "' does not match forces signer: '" + this.signingAccountForImport + "'";
            }
          }
        } else {
          this.importSuccess = false;
          this.import_tx_hash = "abc";

          if(websocketResult.declined)
            this.importErrorLabel = "You declined the sign request.";
          else if(websocketResult.expired)
            this.importErrorLabel = "The sign request has expired. Please try again.";
        }
      } else {
        console.log("ERROR RESOLVING BLOB")
        this.errorBlob = true;
      }

    } catch(err) {
      console.log(err);
      this.handleError(err);
    }

    this.loadingData = false;
  }

  async awaitSignResult(createdPayload: XummPostPayloadResponse): Promise<XummWebsocketResponse | null> {
    try {
      return new Promise(async (resolve, reject) => {
        try {
          let websocketResponse: XummWebsocketResponse = {
            opened: false,
            expired: false,
            signed: false,
            declined: false
          };
    
          if (createdPayload) {
            console.log("SUBSCRIBING TO PAYLOAD EVENTS")
            //subscribe for updates on payload
            let payloadSubscription = await this.xummClient.payload.subscribe( createdPayload, async (message) => {
                console.log("websocket message", message);
                if (message && message.uuid === createdPayload?.uuid) {
                  if (message.data.opened) {
                    //sign request has been opened
                    console.log("Sign request has been OPENED");
                    websocketResponse.opened = true;
                  } else if (message.data.signed != null) {
                    console.log("Sign request has been SIGNED OR CLOSED");
                    //request has been signed
                    if(message.data.signed) {
                      websocketResponse.signed = true;    
                    } else {
                      websocketResponse.declined = true
                    }

                    resolve(websocketResponse);
                  } else if (message.data.closed) {
                    console.log("Sign request has been DECLINED");
                    //request has been declined/closed
                    websocketResponse.declined = true;
                    resolve(websocketResponse);
                  } else if (message.data.expired) {
                    console.log("Sign request has been EXPIRED");
                    //request has been declined/closed
                    websocketResponse.expired = true;
                    resolve(websocketResponse);
                  }
                } else {
                  console.log("websocket UUID mismatch!");
                }
              }
            );
    
            if (payloadSubscription) {
              //present payload to user
              await this.xummClient.xapp?.openSignRequest(createdPayload);
            }
          }
        } catch(err) {
          console.log(err)
          this.handleError(err);
          resolve(null);
        }
      });
    } catch (err) {
      console.log(err);
      this.handleError(err);
    }
  
    return null;
  }

  openTermsAndConditions() {
    if (typeof window.ReactNativeWebView !== 'undefined') {
      //this.infoLabel = "opening sign request";
      window.ReactNativeWebView.postMessage(JSON.stringify({
        command: "openBrowser",
        url: "https://xahau.services/terms"
      }));
    }
  }

  openPrivacyPolicy() {
    if (typeof window.ReactNativeWebView !== 'undefined') {
      //this.infoLabel = "opening sign request";
      window.ReactNativeWebView.postMessage(JSON.stringify({
        command: "openBrowser",
        url: "https://xahau.services/privacy"
      }));
    }
  }

  close() {
    if (typeof window.ReactNativeWebView !== 'undefined') {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        command: 'close',
        refreshEvents: 'true'
      }));
    }
  }

  moveNext() {
    // complete the current step
    this.stepper.selected.completed = true;
    this.stepper.selected.editable = false;
    // move to next step
    this.stepper.next();
    this.stepper.selected.editable = true;
  }

  moveBack() {
    //console.log("steps: " + this.stepper.steps.length);
    // move to previous step
    this.stepper.selected.completed = false;
    this.stepper.selected.editable = false;

    this.stepper.steps.forEach((item, index) => {
      if(index == this.stepper.selectedIndex-1 && this.stepper.selectedIndex-1 >= 0) {
        item.editable = true;
        item.completed = false;
      }
    });

    this.stepper.previous();
  }

  scrollToTop() {
    window.scrollTo(0, 0);
  }

  handleError(err) {
    if(err && JSON.stringify(err).length > 2) {
      this.errorLabel = JSON.stringify(err);
      this.scrollToTop();
    }
    this.snackBar.open("Error occured. Please try again!", null, {panelClass: 'snackbar-failed', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
  }

  copyError() {
    if(this.errorLabel) {
      clipboard(this.errorLabel);
      this.snackBar.dismiss();
      this.snackBar.open("Error text copied to clipboard!", null, {panelClass: 'snackbar-success', duration: 3000, horizontalPosition: 'center', verticalPosition: 'top'});
    }
  }
}
