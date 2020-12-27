var Utils = {
    generateUuid() {
        // https://stackoverflow.com/a/2117523
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/\d/g, c =>
          (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    },

    notifyBlockedDownload(downloadItem){
        var notificationOptions = {
          type: "basic",
          iconUrl: "/icons/icon128.png",
          title: chrome.i18n.getMessage("download_blocked_message_title"),
          message: chrome.i18n.getMessage("download_blocked_message_body", [downloadItem.filename, downloadItem.referringPage,  downloadItem.finalUrl])
        };
        
        chrome.notifications.create(Utils.generateUuid(), notificationOptions);
    },

    getCurrentUrl(){
        return Utils.currentUrl;
    },

    getFileExtension(filename){
        if(!filename.includes(".")){
          return "";
        }
      
        var split = filename.split(".");
        return split[split.length -1].toLowerCase();
    },

    isJsDownload(downloadItem){
        var url = downloadItem.finalUrl.toLowerCase();
        return url.startsWith("data:") || url.startsWith("blob:");
      },

      // https://stackoverflow.com/a/48969580
      XhrRequest(url, method = 'GET', headers = {}, postData = null) {
        return new Promise(function (resolve, reject) {
            let xhr = new XMLHttpRequest();
            xhr.open(method, url);

            for(let key in headers){
                xhr.setRequestHeader(key, headers[key]) 
            }

            xhr.onload = function () {
                if (xhr.responseText) {
                    resolve(xhr.responseText);
                } else {
                    reject({
                        status: this.status,
                        statusText: xhr.statusText
                    });
                }
            };
            xhr.onerror = function () {
                reject({
                    status: this.status,
                    statusText: xhr.statusText
                });
            };
            xhr.send(postData);
        });
    },

    parseTemplate(postData, downloadItem){

        var data = {};
        
        for(let key in postData){
            data[key] = postData[key].replaceAll("{url}", downloadItem.referringPage).replaceAll("{fileUrl}", downloadItem.finalUrl).replaceAll("{filename}", downloadItem.filename).replaceAll("{timestamp}", Date.now());
        }

        return data;
    },

    parseUrl(url, downloadItem){
        return url.replaceAll("{url}", downloadItem.referringPage).replaceAll("{fileUrl}", encodeURIComponent(downloadItem.finalUrl)).replaceAll("{filename}", encodeURIComponent(downloadItem.filename)).replaceAll("{timestamp}", Date.now());
    }
}

//https://stackoverflow.com/questions/54821584/chrome-extension-code-to-get-current-active-tab-url-and-detect-any-url-update-in
// Keep track of current tab URL

chrome.tabs.onActivated.addListener(function(activeInfo){
  chrome.tabs.get(activeInfo.tabId, function(tab){
      Utils.currentUrl = tab.url;
  });
});

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (tab.active && change.url) {
      Utils.currentUrl = change.url;         
  }
});
