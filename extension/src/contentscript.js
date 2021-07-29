
// https://stackoverflow.com/a/9517879
function injectScript(scriptBody){
    var script = document.createElement('script');
    script.setAttribute("type", "text/javascript");
    script.textContent = scriptBody;

    (document.head||document.documentElement).appendChild(script);

    script.onload = function() {
        script.parentNode.removeChild(script);
    };
}

var onHashReceived = function(e){
    if(!chrome.runtime){
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

document.addEventListener('kippogcnigegkjidkpfpaeimabcoboak_Hash', onHashReceived);

// This script gets injected into the webpage. It allows us to hook the necessary functions to be able to calculate the SHA256 of the file to be downloaded.
// Web page -> Content script -> Background script

// Unfortunately, the script doesn't load quickly enough when it is loaded asynchronously, meaning we need to manually inject the source.

// digestToHex
injectScript(`
    /* https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest#converting_a_digest_to_a_hex_string */
    function digestToHex(digest){
        const hashArray = Array.from(new Uint8Array(digest));                     // convert buffer to byte array
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); // convert bytes to hex string
        return hashHex;
    }
    `);

// processHash
injectScript(`
    /* https://stackoverflow.com/a/19312198 */
    function processHash(id, initiatingPage, sha256){
        document.dispatchEvent(new CustomEvent('kippogcnigegkjidkpfpaeimabcoboak_Hash', {
            detail: {id: id, sha256: sha256, initiatingPage: initiatingPage}
        }));
    }
    `);

    // createObjectURL hook
injectScript(`
    var actualCreateObjectUrl = window.URL.createObjectURL;

    window.URL.createObjectURL = function(obj){

        var url = actualCreateObjectUrl(obj);
       
        /* createObjectURL supports File, Blob and MediaSource objects. We're not interested in the latter. */
        if(obj instanceof MediaSource){
            return url;
        }
        
        var fileReader = new FileReader();
        fileReader.readAsArrayBuffer(obj);
        
        processHash(url, window.location.href, "Pending");

        fileReader.onloadend = function () {
            crypto.subtle.digest("SHA-256", fileReader.result).then(digest => {
                processHash(url, window.location.href, digestToHex(digest));
            });
        }

        return url;
    }
`);

// anchor tag click hook
injectScript(`
    /* https://stackoverflow.com/a/26324641 */
    var observer = new MutationObserver(function() {
        if (document.body) {
           
            document.body.onclick = function(e){
                var element = e.target;
            
                if (element.tagName.toLowerCase() == "a" && element.hasAttribute("download")){
                    
                    // e.g. 'data:text/something;charset=utf-8,fileContent'
                    var regularExpression = /(data:[A-Za-z]+\\\/[A-Za-z]+;)(charset=[A-Za-z-\\d]+,)(.*)$/;
                        
                    if(regularExpression.test(element.href)){
                        var results = regularExpression.exec(element.href)
            
                        var downloadData = decodeURIComponent(results[3]); // Blindly assume that the downloadData is urlEncoded?
                            
                        var encoded = new TextEncoder().encode(downloadData);
                        
                        processHash(element.href, window.location.href, "Pending");

                        crypto.subtle.digest("SHA-256", encoded).then(digest => {
                            processHash(element.href, window.location.href, digestToHex(digest));
                        });
                    }
                }
            };
            observer.disconnect();
        }
    });
    
    observer.observe(document.documentElement, {childList: true});
`);    