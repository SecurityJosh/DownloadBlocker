var config = null;

// Maps the download URL to the DownloadItem. DownloadItem is enriched with metadata as it becomes available.
var downloadData = {};

// Load initial config
chrome.storage.managed.get(managedConfig => {
  if (managedConfig.Config){
    console.log("Found managed config");
    try{
      config = new configuration(JSON.parse(managedConfig.Config));
    }catch{
      console.log("Got JSON error when trying to parse configuration")
    }
  }
  
  if(!config){
    console.log("Didn't find managed config, using default.")
    configuration.loadDefaultConfig().then(defaultConfig => config = defaultConfig);
  }
});

// Listen for async event giving us a file's metadata, including SHA256 hash, referer and file inspection data.
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    // console.log(sender.tab ? "from a content script:" + sender.tab.url : "from the extension");
    console.log(request);

    if(!request){
      console.log("Request was null?");
      sendResponse(true);
    }

    if(!downloadData[request.id] && request?.sha256 == "Pending" && !request.fileInspectionData){
      console.log("Could not find downloadData[request.id] : " + request.id);
      downloadData[request.id] = {};
    }

    var downloadDetails = downloadData[request.id];

    if(request["sha256"] && (!downloadDetails.sha256 || downloadDetails.sha256 == "Pending")){
      downloadDetails.sha256 = request["sha256"];
    }

    if(request["initiatingPage"] && !downloadDetails.referringPage){
      downloadDetails.referringPage = request["initiatingPage"];
    }

    if(request["fileInspectionData"] && !downloadDetails.fileInspectionData){
      // This assumed that all file inspection data is sent together. Maybe we should merge arrays instead?
      downloadDetails.fileInspectionData = request["fileInspectionData"];
    }  
      
    //delete downloadHashes[downloadItem.finalUrl];

    if(downloadDetails.state){ // If downloadDetails is a DownloadItem and not just a metadata array.
      console.log("Resubmitting download for scanning");
      processDownload(downloadDetails);
    }

    
    
    sendResponse(true);
  }
);

// Listen for config changes
chrome.storage.onChanged.addListener(function(changes, namespace) {
  if(!namespace == "managed"){
    return;
  }

  for (var key in changes) {
    if(key == "Config"){
      console.log("config change detected");
      config = new configuration(JSON.parse(changes["Config"].newValue));
    }
  }
});

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

    chrome.downloads.erase({"id" : downloadItem.id}, function(){});
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

// https://stackoverflow.com/a/44476626
function timer(ms) { return new Promise(res => setTimeout(res, ms)); }

async function waitForDownloadMetadata(downloadItem){
  let counter = 1;
  while(counter <= 10 && downloadData[downloadItem.finalUrl] && (downloadData[downloadItem.finalUrl].sha256 == "Pending" || !downloadData[downloadItem.finalUrl].fileInspectionData)){
    console.log("wait");
    await timer(250);
    counter++;
  }

  console.log(downloadData);

  return downloadData[downloadItem.finalUrl];
}

/*
  This function can be called multiple times per download (e.g.)
    When the download is first created
    When the download's filename has been determined
    Whenever the download changes state (in_progress, interrupted, complete)
    When the file's SHA256 hash has been calculated
    When fille inspection has been completed
*/
function processDownload(downloadItem){
  var filename = downloadItem.filename;

  if(!filename){
    return;
  }

  if(!config){
    console.log("Config wasn't loaded in time.");
    return;
  }

  if(downloadItem.state == "interrupted"){
    return;
  }

  if(downloadData[downloadItem.finalUrl]){

    var existingDownloadItem = downloadData[downloadItem.finalUrl];

    // Copy file metadata to updated DownloadItem
    downloadItem.sha256 = existingDownloadItem.sha256;
    downloadItem.fileInspectionData = existingDownloadItem.fileInspectionData;
    // Utils.getCurrentUrl uses the currently active tab, which might not actually be the tab that initiated the download. Where possible, give priority to the URL provided by the content script.
    downloadItem.referringPage = existingDownloadItem.referringPage || Utils.getCurrentUrl(); // downloadItem.referringPage || Utils.getCurrentUrl();

    // If the download ID is the same we don't need to block the download again.
    if(existingDownloadItem.id == downloadItem.id){
      downloadItem.DownloadWillBeBlocked = existingDownloadItem.DownloadWillBeBlocked ?? false;
    }
  }

  downloadItem.referringPage = downloadItem.referringPage || Utils.getCurrentUrl();
  downloadData[downloadItem.finalUrl] = downloadItem;

  console.log("Processing download with id: " + downloadItem.id + ", state is: " + downloadItem.state);
  console.log(structuredClone(downloadItem));

  if(downloadItem.DownloadWillBeBlocked){
    console.log("Download is already in the process of being blocked, no need to rerun.");
    return;
  }
  
  var matchedRule = config.getMatchedRule(downloadItem);

  if(!matchedRule){
    console.log("Download didn't match any rules")
    return;
  }

  console.log("Matched rule:");
  console.log(matchedRule);

  // Default to block except where action is set explicitly to something else

  var ruleAction = config.getRuleAction(matchedRule);
  
  downloadItem["action"] = ruleAction; // For alerting purposes

  var shouldBlockDownload = !["audit", "notify"].includes(ruleAction);

  if(shouldBlockDownload || (ruleAction == "audit" && !config.getAlertConfig())){
    if(shouldBlockDownload){
      console.log("Action not set to audit or notify, blocking download");
    }else{
      console.log("Action not set to audit or notify, but no alertConfig is specified, blocking download");
    }

    downloadItem.DownloadWillBeBlocked = true;
    downloadData[downloadItem.finalUrl] = downloadItem;
    
    abortDownload(downloadItem);

    var title = Utils.parseString(matchedRule.titleTemplate, downloadItem) || chrome.i18n.getMessage("download_blocked_message_title");
    var message = Utils.parseString(matchedRule.messageTemplate, downloadItem) || chrome.i18n.getMessage("download_blocked_message_body", [downloadItem.filename, downloadItem.referringPage, downloadItem.finalUrl]);
    Utils.notifyUser(title, message);
  }else{
    if(ruleAction == "notify"){

      if(downloadItem.state == "in_progress"){
        console.log("Wait for download to finish before issuing notification");
        return;
      }

      console.log("Rule action is set to notify");

      var title = Utils.parseString(matchedRule.titleTemplate, downloadItem) || chrome.i18n.getMessage("download_notify_message_title");
      var message = Utils.parseString(matchedRule.messageTemplate, downloadItem) || chrome.i18n.getMessage("download_notify_message_body", [downloadItem.filename, downloadItem.referringPage, downloadItem.finalUrl]);
      Utils.notifyUser(title, message);

    }else{
      console.log("Rule action is set to audit, download won't be blocked.");
    }
  }

  waitForDownloadMetadata(downloadItem).then(async function (downloadItem) {
    if(downloadItem == null || !downloadItem.id){ // Timed out waiting for metadata.
      return;
    }

    await config.sendAlertMessage(downloadItem);

    // Since the data data:// URLs contain is immutable, don't remove them from the cache. This works around a race condition where downloads of the same data:// URL multiple times in quick succession can result in the metadata being lost.
    if(!downloadItem.finalUrl.toLowerCase().startsWith("data:")){
      delete downloadData[downloadItem.finalUrl];
    }
    
  });
}

// onDeterminingFilename doesn't seem to trigger for files downloaded via CTRL + S, so we use .onChanged for these instances
chrome.downloads.onChanged.addListener(function callback(downloadDelta){
  if(downloadDelta.state){

    chrome.downloads.search({'id' : downloadDelta.id}, function(items){
      if(items && items.length == 1){
        processDownload(items[0]);
      }
    });
  }
});

// By listening for this event we can cancel the download before the user even sees a save-as prompt.
// Unfortunately, the download doesn't yet have a filename if we try to use the chrome.downloads.onCreated event, so this is the earliest point we have all of the information available to cancel the download.
chrome.downloads.onDeterminingFilename.addListener(function(downloadItem, suggest) {
  var suggestion = {
    filename: downloadItem.filename,
    conflict_action: 'uniquify',
    conflictAction: 'uniquify'
  };

  suggest(suggestion);
  processDownload(downloadItem);

});

//https://stackoverflow.com/questions/54821584/chrome-extension-code-to-get-current-active-tab-url-and-detect-any-url-update-in
// Keep track of current tab URL, in order to correlate which URL is responsible for a download

/*
    Unfortunately due to a bug in Chromium V91, the code to keep track of the current URL can fail, so we have to wrap in a setTimeout call.
    https://bugs.chromium.org/p/chromium/issues/detail?id=1213925
*/
function UpdateCurrentUrl(activeInfo) {
  chrome.tabs.get(activeInfo.tabId, function(tab){
    if (chrome.runtime.lastError) {
      setTimeout(function(){UpdateCurrentUrl(activeInfo) }, 500); // arbitrary delay
      return;
    }
    Utils.currentUrl = tab.url;
  });
}

chrome.tabs.onActivated.addListener(function(activeInfo){    
  UpdateCurrentUrl(activeInfo);
});

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (tab.active && change.url) {
      Utils.currentUrl = change.url;         
  }
});