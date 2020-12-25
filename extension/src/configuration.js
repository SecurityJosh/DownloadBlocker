class configuration{

    rules = {};
    alertConfig = null;

    constructor(json){

        if(json.rules && Array.isArray(json.rules)){
            this.rules = json.rules.filter(x => this.isRuleValid(x));
        }

        console.log(this.rules.length + " rules loaded");

        if(json.alertConfig){
            this.alertConfig = json.alertConfig;
        }
        
    }

    isExtensionBanned(list, fileExtension){
        return list.map(x => x.toLowerCase()).includes(fileExtension.toLowerCase()) || list.includes("*");
    }

    isRuleValid(rule){
        if(!(rule.bannedExtensions && Array.isArray(rule.bannedExtensions))){
            return false;
        }

        if(!["local", "server", "any"].includes(rule.origin)){
            return false;
        }

        if(rule.exceptions && !Array.isArray(rule.exceptions)){
            return false;
        }

        return true;
    }

    doesExceptionExist(rule, downloadItem){

        if(!downloadItem.exceptions){
            return false;
        }

        for (let exceptionIndex = 0; exceptionIndex < rule.exceptions.length; exceptionIndex++) {
            const exception = rule.exceptions[exceptionIndex];
            
            var exceptionType = exception.type;
            var exceptionValue = exception.value;

            if(exceptionType == "hostname" && downloadItem.referringPage != null && new URL(downloadItem.referringPage).hostname.toLowerCase() == exceptionValue.toLowerCase()){
                return true;
            }

        }
        return false;
    }

    doesDownloadMatchRule(rule, downloadItem){
        var fileExtension = Utils.getFileExtension(downloadItem.filename);
        
        var isJsDownload = Utils.isJsDownload(downloadItem);

        if(!this.isExtensionBanned(rule.bannedExtensions, fileExtension)){
            return false;
        }

        if((rule.origin == "local" && !isJsDownload) || rule.origin == 'server' && isJsDownload){
            return false;
        }

        if(this.doesExceptionExist(rule, downloadItem)){
            console.log("exception found");
            return false;
        }

        return true;
       
    }

    getShouldBlockDownload(downloadItem){
        for (let ruleIndex = 0; ruleIndex < this.rules.length; ruleIndex++) {
            const rule = this.rules[ruleIndex];
        
            if(this.doesDownloadMatchRule(rule, downloadItem)){
                return true;
            }
        }

        return false;
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

