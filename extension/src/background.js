var config = null;

// Load initial config
chrome.storage.managed.get(managedConfig => {
  if (managedConfig.Config){
    console.log("Found managed config");
    config = new configuration(JSON.parse(managedConfig.Config));
  }else{
    console.log("Didn't find managed config :(")
    configuration.loadDefaultConfig().then(c => config = c);
  }
});


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
    return;
  }

  if(downloadItem.state == "complete"){
    deleteSuccessfulDownload(downloadItem);    
  }else{
    cancelDownloadInProgress(downloadItem);
  }
}

function processDownload(downloadItem){
  
  var filename = downloadItem.filename;

  if(!filename){
    return;
  }

  if(!config){
    console.log("Config wasn't loaded in time.");
    return;
  }

  console.log(filename);
  console.log("Processing download with id: " + downloadItem.id);

  downloadItem.referringPage = Utils.getCurrentUrl();

  if(config.getShouldBlockDownload(downloadItem)){
    console.log("aborting");

    abortDownload(downloadItem);

    Utils.notifyBlockedDownload(downloadItem);

    config.sendAlertMessage(downloadItem).then(response => {
      console.log(response);
    });
  }
}

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
chrome.downloads.onDeterminingFilename.addListener(function(downloadItem, suggest) {
  var suggestion = {
    filename: downloadItem.filename,
    conflict_action: 'uniquify',
    conflictAction: 'uniquify'
  };

  suggest(suggestion);

  processDownload(downloadItem);
});



