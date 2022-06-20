(function(){
    const eventId = 'kippogcnigegkjidkpfpaeimabcoboak_Hash';
    const scriptId = 'kippogcnigegkjidkpfpaeimabcoboak_Script';

    const _createObjectURL = window.URL.createObjectURL;
    const URL = window.location.href;
    const _dispatchEvent = document.dispatchEvent.bind(document); // https://stackoverflow.com/a/10743608

    // Hook event dispatch to prevent unauthorized calls
    document.dispatchEvent = function(event){
        if(event && event.type && event.type === eventId){
            return;
        }
        _dispatchEvent(event);
    }

    // iframe src
    let iFrameObserver = new MutationObserver(function(m){
        if(document.body){
            let iframes = Array.from(m).filter(x => x.target instanceof HTMLIFrameElement);
            if(iframes.length){
                let sources = Array.from(new Set(iframes)).map(x => x?.target?.attributes?.src?.value);
                sources.forEach(x => processUri(x, window.location.href));
            }
        }
    });
    
    iFrameObserver.observe(document.documentElement, {childList: true, subtree: true, attributes: true});

    // Hook createObjectURL
    window.URL.createObjectURL = function(obj){
        let url =  _createObjectURL(obj);

        // createObjectURL supports File, Blob and MediaSource objects. We're not interested in the latter. 
        if(obj instanceof MediaSource){
            return url;
        }
        
        let fileReader = new FileReader();
        fileReader.readAsArrayBuffer(obj);

        let guid = generateGuid();

        processHash(guid, url, window.location.href, "Pending");

        fileReader.onloadend = function () {
            let fileInspection = inspectFile(fileReader.result);
            processHash(guid, url, window.location.href, "Pending", fileInspection);
            crypto.subtle.digest("SHA-256", fileReader.result).then(digest => {
                processHash(guid, url, window.location.href, digestToHex(digest), fileInspection);
            });
        }

        return url;
    }

    // anchor tag click hook
    // https://stackoverflow.com/a/26324641
    let observer = new MutationObserver(function() {
        if (document.body) {
           
            document.body.addEventListener("click", function(e){
                let element = e.target;
            
                if (element.tagName.toLowerCase() == "a" && element.hasAttribute("download")){
                    
                    processUri(element.href, window.location.href);

                }
            });
            observer.disconnect();
        }
    });
    observer.observe(document.documentElement, {childList: true});

    const base64ToArrayBuffer = function(base64) {
        var binary_string = window.atob(base64);
        var len = binary_string.length;
        var bytes = new Uint8Array( len );
        for (var i = 0; i < len; i++) { bytes[i] = binary_string.charCodeAt(i); }
        return bytes.buffer;
    }

    const processUri = function(url, downloadUrl){

        if(!url){
            return false;
        }

        url = url.replace(/^data:/i, "data:");

        let downloadData = parseDataUri(url);

        if(!downloadData){
            return;
        }
                            
        let encoded = downloadData;
        // function(guid, downloadUrl, initiatingPage, sha256, fileInspectionData){

        let guid = generateGuid();

        processHash(guid, url, downloadUrl, "Pending");

        crypto.subtle.digest("SHA-256", encoded).then(digest => {
            processHash(guid, url, downloadUrl, digestToHex(digest), inspectFile(encoded));
        });
    }

    const parseDataUri = function(uri){
        // e.g. 'data:text/something;charset=utf-8,fileContent'
        // e.g. 'data:text/something,fileContent'
        //const regularExpression = /(data:[A-Za-z]+\\\/[A-Za-z]+;)(charset=[A-Za-z-\\d]+,)(.*)$/;
        //const regularExpression = /(data:[A-Za-z]+\\\/[A-Za-z]+;)(charset=[A-Za-z-\\d]+)(;base64)?,(.*)$/i;
        const regularExpression = /data:([A-Za-z-]+\/[A-Za-z-]+)?.*?(;charset=[A-Za-z-\d]+)?.*?(;base64)?,(.*)$/i;

        if(regularExpression.test(uri)){
            let results = regularExpression.exec(uri)
                        
            let downloadData = results[4];

            if(results[3] != null){ // results[3] == ;base64
                try{
                    return new Uint8Array(base64ToArrayBuffer(downloadData));
                }catch(e){
                    return new Uint8Array([]);
                }
            }else{
                return new TextEncoder().encode(decodeURIComponent(downloadData)); // Blindly assume that the downloadData is urlEncoded?
            }
        }
    }

    const generateGuid = function(){
        // https://stackoverflow.com/a/2117523
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/\d/g, c =>
          (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    };

    const inspectFile = function(data){
        return {"macros" : doesFileHaveMacros(data)};
    }

    const digestToHex = function(digest){
        const hashArray = Array.from(new Uint8Array(digest));                     // convert buffer to byte array
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // convert bytes to hex string
        return hashHex;
    }

    const processHash = function(guid, downloadUrl, initiatingPage, sha256, fileInspectionData){
        _dispatchEvent(new CustomEvent(eventId, {
            detail: {guid : guid, id : downloadUrl, sha256: sha256, initiatingPage: initiatingPage, fileInspectionData: fileInspectionData}
        }));
    }

    // https://www.30secondsofcode.org/articles/s/javascript-array-comparison
    const equals = (a, b) =>  a.length === b.length && a.every((v, i) => v === b[i]);

    // == File inspection functions ==

    const byteSearch = function(fileBytes, fileHeader, searchBytes){
        fileBytes = new Uint8Array(fileBytes);

        if(fileBytes.length < fileHeader.length + searchBytes.length){
            return false;
        }

        if(!(equals(fileBytes.slice(0, fileHeader.length), fileHeader))){
            return false;
        }
        
        // fileBytes.some((e, i) => {return equals(fileBytes.slice(i, i + searchBytes.length), searchBytes)});

        for (var i = Math.max(0, fileHeader.length -1); i < fileBytes.length - (searchBytes.length -1); i++){
            var slice = fileBytes.slice(i, i + searchBytes.length);
            if(equals(slice, searchBytes)){
                return true;
            }
        }

        return false;
    };

    const doesFileHaveExcel4Macros = function(fileBytes){
    /*
        // https://blog.reversinglabs.com/blog/excel-4.0-macros
        rule Excel_Macros40_String
        {
            strings:
                $a = { 20 45 78 63 65 6C 20 34 2E 30 00 } 
                $b = { 00 45 78 63 65 6C 20 34 2E 30 20 }
                $c = { 00 45 78 63 65 6C 20 34 2E 30 2D }
                $fp = { 31 39 39 32 20 45 78 63 65 6C 20 34 2E 30 00 }
            condition:
                uint32(0) == 0xE011CFD0 and uint32(4) == 0xE11AB1A1 and any of ($a,$b,$c) and not $fp
        }
    */
        var compoundFileHeader = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]

        var pattern1 = [0x20, 0x45, 0x78, 0x63, 0x65, 0x6C, 0x20, 0x34, 0x2E, 0x30, 0x00]; // " Excel 4.0[NUL]"
        var pattern2 = [0x00, 0x45, 0x78, 0x63, 0x65, 0x6C, 0x20, 0x34, 0x2E, 0x30, 0x00]; // "[NUL]Excel 4.0[NUL]"
        var pattern3 = [0x00, 0x45, 0x78, 0x63, 0x65, 0x6C, 0x20, 0x34, 0x2E, 0x30, 0x2D]; // "[NUL]Excel 4.0-"
        var falsePositive = [0x31, 0x39, 0x39, 0x32, 0x20, 0x45, 0x78, 0x63, 0x65, 0x6C, 0x20, 0x34, 0x2E, 0x30, 0x00]; // "1992 Excel 4.0"

        return (
                byteSearch(fileBytes, compoundFileHeader, pattern1) ||
                byteSearch(fileBytes, compoundFileHeader, pattern2) ||
                byteSearch(fileBytes, compoundFileHeader, pattern3)
                ) && !byteSearch(fileBytes, compoundFileHeader, falsePositive)
    }

    const doesFileHaveOfficeMacros = function(fileBytes){
        // https://blog.rootshell.be/2015/01/08/searching-for-microsoft-office-files-containing-macro/
        // https://isc.sans.edu/forums/diary/Malicious+Excel+Sheet+with+a+NULL+VT+Score+More+Info/26516/
        // https://www.dshield.org/forums/diary/YARA+and+CyberChef/27180/
        /*
            rule office_macro
            {
                strings:
                    $a = {d0 cf 11 e0}
                    $b = {00 41 74 74 72 69 62 75 74 00}
                condition:
                    $a at 0 and $b
            }
        */

        var officeHeaderBytes = [0xd0, 0xcf, 0x11, 0xe0];
        var macroBytes = [0x00, 0x41, 0x74, 0x74, 0x72, 0x69, 0x62, 0x75, 0x74, 0x00]; // [NUL]Attribut[NUL]

        return byteSearch(fileBytes, officeHeaderBytes, macroBytes);
    }

    const doesFileHaveMacros = function(fileBytes){
        return doesFileHaveOfficeMacros(fileBytes) || doesFileHaveExcel4Macros(fileBytes);
    }
    // == End file inspection functions ==

    while(scriptElement = document.getElementById(scriptId)){
        scriptElement.parentNode.removeChild(scriptElement);
    }
})();