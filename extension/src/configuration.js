class configuration{

    bannedExtensionsJs = [];
    bannedExtensionsServer = [];
    alertConfig = null;

    constructor(json){

        if(json.bannedExtensionsJs){
            this.bannedExtensionsJs = json.bannedExtensionsJs;
        }
        
        if(json.bannedExtensionsServer){
            this.bannedExtensionsServer = json.bannedExtensionsServer;
        }
        
        if(json.alertConfig){
            this.alertConfig = json.alertConfig;
        }
        
    }

    isExtensionBanned(list, fileExtension){
        console.log(list);
        return list.map(x => x.toLowerCase()).includes(fileExtension.toLowerCase()) || list.includes("*");
    }

    getShouldBlockDownload(downloadItem){

        var fileExtension = Utils.getFileExtension(downloadItem.filename);
        
        var isJsDownload = Utils.isJsDownload(downloadItem);

        if(isJsDownload){
            return this.isExtensionBanned(this.bannedExtensionsJs, fileExtension); 
        }
        
        return this.isExtensionBanned(this.bannedExtensionsServer, fileExtension);
    }

    getBannedExtensionsJs(){
        return this.bannedExtensions;
    }

    getShouldBlockAllJsDownloads(){
        return this.blockAllJsDownloads;
    }

    getAlertConfig(){
        return this.alertConfig;
    }

    async sendAlertMessage(downloadItem){
        if(!this.alertConfig){
            return;
        }

        var url = Utils.parseUrl(this.alertConfig.url, downloadItem);

        var headers = this.alertConfig.headers ?? {};

        if(this.alertConfig.method == "POST"){
            if(this.alertConfig.sendAsJson){
                headers["Content-Type"] = 'application/json';
            }else{
                headers["Content-Type"] = 'application/x-www-form-urlencoded';
            }
        }

        var postData = Utils.parseTemplate(this.alertConfig.postData, downloadItem);

        if(this.alertConfig.sendAsJson){
            postData = JSON.stringify(postData);
        }else{
            postData = new URLSearchParams(postData);
        }

        var alertResponse = await Utils.XhrRequest(url, this.alertConfig.method, headers, postData);

        return alertResponse;
    }

    static async loadConfig(){
        var configFileUrls = [chrome.runtime.getURL("config/config.json")];
        
        for(var i = 0; i < configFileUrls.length; i++){

            var config = null;
            try{
                config = await Utils.XhrRequest(configFileUrls[i]);
            }catch{
                continue;
            }

            try{

                var parsed = JSON.parse(config);
                
                console.log(`Loaded config from '${configFileUrls[i]}'`);

                return new configuration(parsed);
            }catch{}

        }
    }
}

