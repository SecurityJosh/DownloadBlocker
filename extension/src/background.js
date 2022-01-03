var config = null;

var downloadHashes = {};

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

// Listen for async event giving us a file's SHA256 hash.
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    // console.log(sender.tab ? "from a content script:" + sender.tab.url : "from the extension");
    console.log(request);

    if (!downloadHashes[request.id] || downloadHashes[request.id].sha256 == "Pending" || request.fileInspectionData){
      downloadHashes[request.id] = {"sha256" : request["sha256"], "initiatingPage" : request["initiatingPage"], "fileInspectionData" : request["fileInspectionData"] };
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
    chrome.downloads.erase({"id" : downloadItem.id}, function(){});
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

async function waitForFileHash(downloadItem){
  while(downloadHashes[downloadItem.finalUrl] && (downloadHashes[downloadItem.finalUrl].sha256 == "Pending" || !downloadHashes[downloadItem.finalUrl].fileInspectionData)){
    await timer(250);
  }

  var downloadDetails = downloadHashes[downloadItem.finalUrl];

  if(downloadDetails){
    downloadItem.sha256 = downloadDetails.sha256 || downloadItem.sha256;
    downloadItem.referringPage = downloadDetails.initiatingPage || downloadItem.referringPage;
    downloadItem.fileInspectionData = downloadDetails.fileInspectionData || downloadItem.fileInspectionData;
    //delete downloadHashes[downloadItem.finalUrl];
  }
}

async function processDownload(downloadItem){
  console.log(downloadItem);  
  var filename = downloadItem.filename;

  if(!filename){
    return;
  }

  if(!config){
    console.log("Config wasn't loaded in time.");
    return;
  }

  console.log(filename);
  console.log("Processing download with id: " + downloadItem.id + ", state is: " + downloadItem.state);

  downloadItem.referringPage = Utils.getCurrentUrl();

  if(downloadHashes[downloadItem.finalUrl]){
    let downloadHash = downloadHashes[downloadItem.finalUrl];

    downloadItem.referringPage = downloadHash.initiatingPage || downloadItem.referringPage;
    downloadItem.fileInspectionData = downloadHash.fileInspectionData || downloadItem.fileInspectionData;

    console.log(downloadHash);
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

  await waitForFileHash(downloadItem);
  await config.sendAlertMessage(downloadItem)

  console.log(downloadItem);
}

// onDeterminingFilename doesn't seem to trigger for files downloaded via CTRL + S, so we use .onChanged for these instances
chrome.downloads.onChanged.addListener(function callback(downloadDelta){
  if(downloadDelta.state){

    chrome.downloads.search({'id' : downloadDelta.id}, function(items){
      if(items && items.length == 1){
        processDownload(items[0]).then({});
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

  processDownload(downloadItem).then({});
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