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

        if(!rule.origin || !["local", "server", "any"].includes(rule.origin.toLowerCase())){
            return false;
        }

        if(rule.exceptions && !Array.isArray(rule.exceptions)){
            return false;
        }

        if(rule.urlScheme && !Array.isArray(rule.urlScheme)){
            return false;
        }

        if(rule.fileInspection && (!rule.fileInspection instanceof Object || Object.keys(rule.fileInspection).length == 0)){
            return false;
        }

        if(!["block", "audit", "notify"].includes(this.getRuleAction(rule))){
            return false;
        }

        if(!["ruleaction", "metadata"].includes(this.getRuleResponsePriority(rule))){
            return false;
        }

        return true;
    }

    doesDomainMatch(matchType, matchValue, downloadItem){

        // If the download is HTML smuggled, use the referring page, otherwise use the file URL.

        var downloadHostname = new URL(Utils.isJsDownload(downloadItem) ? downloadItem.referringPage : downloadItem.finalUrl).hostname.toLowerCase();
        var referrerHostname = downloadItem.referringPage ? new URL(downloadItem.referringPage).hostname.toLowerCase() : "";

        let domainMatch = (downloadHostname, referrerHostname, matchType, matchValue) => {
            let funcs = {
                "hostname" : (downloadHostname, referrerHostname, matchValue) => downloadHostname == matchValue.toLowerCase(),
                "basedomain" : (downloadHostname, referrerHostname, matchValue) => ('.' + downloadHostname).endsWith('.' + matchValue.toLowerCase()),
                "referrerhostname" : (downloadHostname, referrerHostname, matchValue) => referrerHostname == matchValue.toLowerCase(),
                "referrerbasedomain" : (downloadHostname, referrerHostname, matchValue) => ('.' + referrerHostname).endsWith('.' + matchValue.toLowerCase()),
            };

            return funcs[matchType](downloadHostname, referrerHostname, matchValue);
        };

        if(Array.isArray(matchValue)){
            return matchValue.some(x => domainMatch(downloadHostname, referrerHostname, matchType, x));
        }

        return domainMatch(downloadHostname, referrerHostname, matchType, matchValue);
    }

    checkException(exception, downloadItem){
        var exceptionType = exception.type.toLowerCase();
        var exceptionValue = exception.value;

        switch(exceptionType){
            case "hostname":
            case "basedomain":
            case "referrerhostname":
            case "referrerbasedomain":
                return this.doesDomainMatch(exceptionType, exceptionValue, downloadItem);
            case "fileextensions":
                return this.isExtensionInList(exceptionValue, Utils.getFileExtension(downloadItem.filename));
            default:
                console.log(`exceptionType: '${exceptionType}' was not recognised. Value given: '${exceptionValue}'`);
                return false;
        }
    }

    doesExceptionExist(rule, downloadItem){

        if(!rule.exceptions){
            return false;
        }

        for (let exceptionIndex = 0; exceptionIndex < rule.exceptions.length; exceptionIndex++) {
            const exception = rule.exceptions[exceptionIndex];

            if(this.checkException(exception, downloadItem)){
                return true;
            }  
        }

        return false;
    }

    doesFileNameRegexMatch(rule, downloadItem){
        if (!downloadItem.filename){
            return false;
        }

        try{
            var regex = new RegExp(rule.fileNameRegex);
            return regex.test(downloadItem.filename);
        }catch{
            console.log(`Failed to compile regex '${rule.fileNameRegex}'`);
            return false;
        }
    }

    doesFileInspectionMatch(rule, downloadItem){

        if(!downloadItem.fileInspectionData){
            return false;
        }

        for(var key of Object.keys(rule.fileInspection)){
            if ((!downloadItem.fileInspectionData[key]) || downloadItem.fileInspectionData[key] !== rule.fileInspection[key]){
                return false;
            }
        }
        return true;
    }
    
    doesDownloadMatchRule(rule, downloadItem){
        var fileExtension = Utils.getFileExtension(downloadItem.filename);
        
        var isJsDownload = Utils.isJsDownload(downloadItem);

        if(!this.isExtensionInList(rule.bannedExtensions, fileExtension)){
            console.log("File extension didn't match rule");
            return false;
        }
        
        var ruleOrigin = rule.origin.toLowerCase();

        if((ruleOrigin == "local" && !isJsDownload) || ruleOrigin == 'server' && isJsDownload){
            console.log("Rule origin didn't match");
            return false;
        }

        if(rule.fileInspection && !this.doesFileInspectionMatch(rule, downloadItem)){
            console.log("file inspection didn't match");
            return false;
        }

        if(rule.fileNameRegex && !this.doesFileNameRegexMatch(rule, downloadItem)){
            console.log("fileNameRegex didn't match");
            return false;
        }

        if(rule.urlScheme){

            var ruleUrlScheme = rule.urlScheme.map(x => x.toLowerCase());

            var urlScheme = new URL(downloadItem.referringPage).protocol.slice(0, -1).toLowerCase(); // e.g. file, http, https instead of file:, http:, https:

            if(!ruleUrlScheme.includes(urlScheme)){
                console.log("URL scheme didn't match");
                return false;
            }
        }

        var domainDoesntMatch = ["hostname", "basedomain", "referrerhostname", "referrerbasedomain"].some(domainMatchType => {
            return rule[domainMatchType] && !this.doesDomainMatch(domainMatchType, rule[domainMatchType], downloadItem);
        });

        if(domainDoesntMatch){
            console.log("Download didn't match domain filter");
            return false;
        }

        if(this.doesExceptionExist(rule, downloadItem)){
            console.log("exception found");
            return false;
        }

        return true;
       
    }

    getRuleResponsePriority(rule){
        if(!rule.responsePriority){
            return "ruleaction"
        }

        return rule.responsePriority.toLowerCase();
    }

    getRuleAction(rule){
        if(!rule.action){
            return "block";
        }

        return rule.action.toLowerCase();
    }

    getMatchedRule(downloadItem){

        var matchedRule = null;

        for (let ruleIndex = 0; ruleIndex < this.rules.length; ruleIndex++) {
            const rule = this.rules[ruleIndex];
            
            console.log(rule);

            if(this.doesDownloadMatchRule(rule, downloadItem)){
                
                downloadItem.ruleName = rule.ruleName ?? "";

                if(this.getRuleAction(rule) == "block"){
                    return rule;
                }

                matchedRule = rule;
            }
        }

        return matchedRule;
    }

    getBannedExtensionsJs(){
        return this.bannedExtensions;
    }

    getAlertConfig(){
        return this.alertConfig;
    }

    async sendAlertMessage(downloadItem){
        console.log("in sendAlertMessage");
        console.log(this.alertConfig);
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

        try{
            return await Utils.XhrRequest(url, this.alertConfig.method, headers, postData);
        }catch(e){
            console.log(e);
            console.log("Error sending alert");
            return false;
        }
    }

    static async loadDefaultConfig(){
        var configUrl = chrome.runtime.getURL("config/config.json");
    
        try{

            var config = await (await Utils.XhrRequest(configUrl)).json();

            console.log(config);
                
            console.log(`Loaded config from '${configUrl}'`);
            return new configuration(config);
        }catch(ex){
            console.log("Failed to lod config" + ex);
            return null;
        }
    }
}