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

    isExtensionInList(list, fileExtension){
        return list.map(x => x.toLowerCase()).includes(fileExtension.toLowerCase()) || list.includes("*");
    }

    isRuleValid(rule){
        if(!rule.bannedExtensions || !Array.isArray(rule.bannedExtensions)){
            return false;
        }

        if(!["local", "server", "any"].includes(rule.origin.toLowerCase())){
            return false;
        }

        if(rule.exceptions && !Array.isArray(rule.exceptions)){
            return false;
        }

        return true;
    }

    doesExceptionExist(rule, downloadItem){

        if(!rule.exceptions){
            return false;
        }

        for (let exceptionIndex = 0; exceptionIndex < rule.exceptions.length; exceptionIndex++) {
            const exception = rule.exceptions[exceptionIndex];
            
            var exceptionType = exception.type.toLowerCase();
            var exceptionValue = exception.value.toLowerCase();
            
            if(!downloadItem.referringPage){
                return false;
            }

            var downloadHostname = new URL(downloadItem.referringPage).hostname;

            switch(exceptionType){
                case "hostname":
                    return downloadHostname == exceptionValue.toLowerCase();
                case "basedomain":
                    return ('.' + downloadHostname).endsWith('.' + exceptionValue);
                case "fileextensions":
                    return this.isExtensionInList(exceptionValue, Utils.getFileExtension(downloadItem.filename));
                default:
                    console.log(`exceptionType: '${exceptionType}' was not recognised. Value given: '${exceptionValue}'`);
                    return false;
            }
        }

        return false;
    }

    doesDownloadMatchRule(rule, downloadItem){
        var fileExtension = Utils.getFileExtension(downloadItem.filename);
        
        var isJsDownload = Utils.isJsDownload(downloadItem);

        if(!this.isExtensionInList(rule.bannedExtensions, fileExtension)){
            return false;
        }
        
        var ruleOrigin = rule.origin.toLowerCase();

        if((ruleOrigin == "local" && !isJsDownload) || ruleOrigin == 'server' && isJsDownload){
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
        var postData = null;
        var headers = this.alertConfig.headers ?? {};

        if(this.alertConfig.method == "POST"){
            postData = Utils.parseTemplate(this.alertConfig.postData, downloadItem);

            if(this.alertConfig.sendAsJson){
                headers["Content-Type"] = 'application/json';
                postData = JSON.stringify(postData);
            }else{
                headers["Content-Type"] = 'application/x-www-form-urlencoded';
                postData = new URLSearchParams(postData);
            }
        }

        return await Utils.XhrRequest(url, this.alertConfig.method, headers, postData);
    }

    static async loadDefaultConfig(){
        var configUrl = chrome.runtime.getURL("config/config.json");
        
        var config = await Utils.XhrRequest(configUrl);

        try{
            var parsed = JSON.parse(config);
                
            console.log(`Loaded config from '${configUrl}'`);
            return new configuration(parsed);
        }catch{
            return null;
        }
    }
}