var onHashReceived = function(e){
    if(!(chrome.runtime?.id)){
        // https://stackoverflow.com/a/69603416
        // chrome.runtime can be null in this callback if the extension has been updated since the page was initially loaded.
        return;
    }

    if(chrome.runtime.lastError){
      console.log(chrome.runtime.lastError.message);
    }
   
    // https://developer.chrome.com/docs/extensions/mv2/messaging/
    chrome.runtime.sendMessage(null, e.detail, function(response) {
        // console.log(response);
    });
};

const eventId = 'kippogcnigegkjidkpfpaeimabcoboak_Hash';

document.addEventListener(eventId, onHashReceived);