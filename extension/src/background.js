async function initConfig(){

  let managedConfig = await chrome.storage.managed.get();

  if(managedConfig.Hostname){
    Utils.Hostname = managedConfig.Hostname;
  }

  if(managedConfig.Username){
    Utils.Username = managedConfig.Username;
  }

  if (managedConfig.Config){
    console.log("Found managed config");
    try{
      return new configuration(JSON.parse(managedConfig.Config));
    }catch{
      console.log("Got JSON error when trying to parse configuration");

      var title = await chrome.i18n.getMessage("config_error_title");
      var message = await chrome.i18n.getMessage("config_error_body");
      Utils.notifyUser(title, message);
      
      return await configuration.loadDefaultConfig();
    }
  }else{
    console.log("Didn't find managed config, using default.")
    return await configuration.loadDefaultConfig();
  }
}

// [GUID] => DownloadId
// GUID_[GUID] -> {macros, sha256 etc.}
// DownloadID_[ID] -> [GUID]
// UrlAtCreationForDownload_[ID] -> URL

async function getStorageDataByKey(key){
  let data = await chrome.storage.session.get(key);
  return data?.[key] ?? null;
}

async function writeStorageData(key, value){
  var data = {};
  data[key] = value;
  return await chrome.storage.session.set(data);
}

async function getDownloadFromGuid(guid){

  let downloadId = await getStorageDataByKey(guid);

  if(!downloadId){
    return null;
  }

  let matchingDownloads = await chrome.downloads.search({id: downloadId});

  return matchingDownloads?.[0];
  
}

async function correlateDownloadWithMetaData(downloadItem){
  
  let downloadGuid = await getStorageDataByKey("DownloadID_" + downloadItem.id);

  if(downloadGuid){
    return await getStorageDataByKey("GUID_" + downloadGuid)
  }
  
  for(const [storageKey, storageData] of Object.entries(await chrome.storage.session.get())){

    /* 
      e.g. 
      "GUID_fbf5b3bd-2bb5-1f49-99ad-af49d8773b47" ->
        {
          guid: 'fbf5b3bd-2bb5-1f49-99ad-af49d8773b47',
          id: 'blob:https://www.outflank.nl/d740384d-8b10-4740-b489-9d97d0ba3017',
          referringPage: 'https://www.outflank.nl/demo/html_smuggling.html',
          sha256: 'Pending'
        }
    */
   
    if(downloadItem.finalUrl == storageData.id){
      await writeStorageData(storageData.guid, downloadItem.id);
      await writeStorageData("DownloadID_" + downloadItem.id, storageData.guid);
      return storageData;
    }
  }

  return null;
}

// Load initial config

// Listen for async event giving us a file's metadata, including SHA256 hash, referer and file inspection data.
chrome.runtime.onMessage.addListener(
  async function(request, sender, sendResponse) {
    // console.log(sender.tab ? "from a content script:" + sender.tab.url : "from the extension");
    sendResponse(true);
    if(!request){
      console.log("Request was null");
      return;
    }
    
    let guid = request.guid;

    let existingData = await getStorageDataByKey("GUID_" + guid);
    if(existingData){
      request.sha256 = request.sha256 && request.sha256 != "Pending" ? request.sha256 : existingData.sha256;
      request.referringPage = existingData.referringPage ?? request.initiatingPage;
      request.id = existingData.id ?? request.id;
      // This assumes that all file inspection data is sent together. Maybe we should merge arrays instead?
      request.fileInspectionData == existingData.fileInspectionData ?? request.fileInspectionData;      
    }

    await writeStorageData("GUID_" + guid, request);

    let downloadItem = await getDownloadFromGuid(guid);

    if(downloadItem){
      await processDownload(downloadItem);
    }
  }
);

// Cancel a download
function cancelDownloadInProgress(downloadItem){
  chrome.downloads.cancel(downloadItem.id, function(){
    if(chrome.runtime.lastError){
      console.log(chrome.runtime.lastError.message);
    }

    chrome.downloads.erase({"id" : downloadItem.id}, function(){ 
      if(chrome.runtime.lastError){
        console.log(chrome.runtime.lastError.message);
      }
    });
  });
}

// Delete a download that has already finished
function deleteSuccessfulDownload(downloadItem){
  chrome.downloads.removeFile(downloadItem.id, function(){
    if(chrome.runtime.lastError){
      console.log(chrome.runtime.lastError.message);
    }

    chrome.downloads.erase({"id" : downloadItem.id}, function(){
      if(chrome.runtime.lastError){
        console.log(chrome.runtime.lastError.message);
      }
    });
  });
}

function abortDownload(downloadItem){    

  if(downloadItem.state == "interrupted"){
    console.log("state was interrupted");
    return;
  }

  if(downloadItem.state == "complete"){
    deleteSuccessfulDownload(downloadItem);    
  }else{
    cancelDownloadInProgress(downloadItem);
  }
}

async function clearSessionStorageData(downloadItem){
  let downloadGuid = await getStorageDataByKey("DownloadID_" + downloadItem.id);

  await chrome.storage.session.remove("DownloadID_" + downloadItem.id);
  await chrome.storage.session.remove("UrlAtCreationForDownload_" + downloadItem.id);

  if(downloadGuid){
    await chrome.storage.session.remove("GUID_" + downloadGuid);
    await chrome.storage.session.remove(downloadGuid);
  }
}

/*
  This function can be called multiple times per download (e.g.)
    When the download is first created
    When the download's filename has been determined
    Whenever the download changes state (in_progress, interrupted, complete)
    When the file's SHA256 hash has been calculated
    When file inspection has been completed
*/
async function processDownload(downloadItem){
  if(downloadItem.state == "interrupted"){
    return;
  }

  let config = await initConfig();

  if(!config){
    console.log("Config wasn't loaded in time.");
    return;
  }

  var matchedRule = config.getMatchedRule(downloadItem);

  if(downloadItem.state == "in_progress" && matchedRule && config.getRuleResponsePriority(matchedRule) == "metadata"){
    return;
  }

  var filename = downloadItem.filename;
  
  if(!filename){
    console.log("filename was null");
    return;
  }

  let downloadData = await correlateDownloadWithMetaData(downloadItem);

  if(downloadData?.sha256 == "Pending" || (downloadData && downloadData?.fileInspectionData == null)){
    console.log(`[${downloadItem.filename}] Waiting for metadata, state is ` + downloadItem.state);
    return;
  }

  let urlAtCreationForDownload = await getStorageDataByKey("UrlAtCreationForDownload_" + downloadItem.id) ?? "";
  let nativeReferrer = downloadItem.referrer;

  // getCurrentUrl() uses the currently active tab, which might not actually be the tab that initiated the download. Where possible, give priority to the URL provided by the content script.
  // The native referrer value doesn't always contain the full URL, but it is more reliable. We can balance the two by preferring the URL of the page the user was on when the download started if partial URL of the native referrer matches it.
  if(urlAtCreationForDownload.startsWith(downloadItem.referrer)){
    downloadItem.referrer = urlAtCreationForDownload;
  }

  downloadItem.referringPage = downloadData?.referringPage || downloadItem.referrer || urlAtCreationForDownload || await getCurrentUrl();
  downloadItem.referrer = nativeReferrer;

  if(!downloadData){
    try{
      console.log("Waiting for Native Messaging host");
      downloadData = await chrome.runtime.sendNativeMessage('securityjosh.download_blocker', { FilePath: downloadItem.filename});
      console.log("Finished waiting for Native Messaging host");
      if(chrome.runtime.lastError){
        console.log(chrome.runtime.lastError.message);
      }
    }catch(e){
      console.log(e);
    }
  }
    
  if(downloadData){
    // Copy file metadata to updated DownloadItem for audit / notification
    downloadItem.sha256 = downloadData.sha256;
    downloadItem.fileInspectionData = downloadData.fileInspectionData;
  }

  console.log("Processing download with id: " + downloadItem.id + ", state is: " + downloadItem.state);
  console.log(structuredClone(downloadItem));

  if(!matchedRule){
    console.log("Download didn't match any rules")
    await clearSessionStorageData(downloadItem);
    return;
  }

  console.log("Matched rule:");
  console.log(matchedRule);

  // Default to block except where action is set explicitly to something else

  var ruleAction = config.getRuleAction(matchedRule);
  
  if(ruleAction == "audit" && !config.getAlertConfig()){
    ruleAction = "block";
    console.log("Action set to audit, but no alertConfig is specified, overriding action to block download");
  }

  downloadItem["action"] = ruleAction; // For alerting purposes

  var shouldBlockDownload = !["audit", "notify"].includes(ruleAction);

  if(shouldBlockDownload){

    console.log("Action not set to audit or notify, blocking download");
    abortDownload(downloadItem);

  }else{
    console.log(`Rule action is set to ${ruleAction}, download won't be blocked.`);
  }

  if(ruleAction != "audit"){
    // If the ruleAction is not audit, i.e. it's block or notify, we need to send the user a notification
    var titleTemplateName = ruleAction == "block" ? "download_blocked_message_title" : "download_notify_message_title";
    var bodyTemplateName  = ruleAction == "block" ? "download_blocked_message_body"  : "download_notify_message_body";
    console.log(downloadItem);
    var title = Utils.parseString(matchedRule.titleTemplate, downloadItem) || await chrome.i18n.getMessage(titleTemplateName);
    var message = Utils.parseString(matchedRule.messageTemplate, downloadItem) || await chrome.i18n.getMessage(bodyTemplateName, [downloadItem.filename, downloadItem.referringPage, downloadItem.finalUrl]);
    Utils.notifyUser(title, message);
  }

  await config.sendAlertMessage(downloadItem);

  await clearSessionStorageData(downloadItem);
}

chrome.downloads.onCreated.addListener(async function (downloadItem){
    if(chrome.runtime.lastError){
      console.log(chrome.runtime.lastError.message);
    }
    
    if(downloadItem.endTime){
      // Workaround for a chrome bug (https://bugs.chromium.org/p/chromium/issues/detail?id=1476069)
      return;
    }

    correlateDownloadWithMetaData(downloadItem);
    writeStorageData("UrlAtCreationForDownload_" + downloadItem.id, await getCurrentUrl());
    processDownload(downloadItem);
  }
);

chrome.downloads.onChanged.addListener(
    function callback(downloadDelta){
      if(chrome.runtime.lastError){
        console.log(chrome.runtime.lastError.message);
      }
      
      if(downloadDelta.state){      
        chrome.downloads.search({'id' : downloadDelta.id}, function(items){
          if(chrome.runtime.lastError){
            console.log(chrome.runtime.lastError.message);
          }

          if(items && items.length == 1){
            processDownload(items[0]);
          }
        });

      }
    }
);

try{
  const scriptId = "DownloadBlockerScript_" + Utils.generateGuid();

  console.log(`Injecting script with ID '${scriptId}'`);
  
  chrome.scripting.registerContentScripts([{
    allFrames : true,
    matchOriginAsFallback: true,
    id: scriptId,
    js : ["src/inject.js"],
    matches : ["<all_urls>"],
    runAt : "document_start",
    world: "MAIN"
  }]);

  if(chrome.runtime.lastError){
    console.log(chrome.runtime.lastError);
  }

}catch(e){
  console.log(e);
}

async function getCurrentUrl() {
  let queryOptions = {active: true, currentWindow: true};
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab?.url || "";
}