// https://bugs.chromium.org/p/chromium/issues/detail?id=1159438#c21

let native = chrome.i18n.getMessage;

async function getMessageAsync(messageName, substitutions){
    return native(messageName, substitutions);
}

const getMessagePolyfill = async (messageName, substitutions) => {
    return new Promise((resolve) => {
     chrome.i18n.getAcceptLanguages(async (languages) => {
        const language = languages[0].split('-')[0];
        const messagesURL = chrome.runtime.getURL(
          `_locales/${language}/messages.json`,
        );
        messages = await fetch(messagesURL)
          .then((response) => response.json())
          .catch(async (_) => {
            const messagesDefaultURL = chrome.runtime.getURL(
              '_locales/en/messages.json',
            );
            return await fetch(messagesDefaultURL).then((response) =>
              response.json(),
            );
          });
        
          if(messages[messageName]){
  
            let message = messages[messageName].message;
  
            let placeholders = message.match(/\$[A-Za-z0-9]+?\$/g);
  
            if(!placeholders){
              return resolve(message);
            }

            if(typeof substitutions == "string"){
                substitutions = [substitutions];
            }
  
            if(placeholders.length != substitutions.length){
              resolve(message);
            }
  
            for (let i = 0; i < placeholders.length; i++) {
              const placeholder = placeholders[i];
              message = message.replace(placeholder, substitutions[i]);
            }
  
            return resolve(message);
          }
          resolve("");
      });
    });
  };

chrome.i18n.getMessage = chrome.i18n.getMessage ? getMessageAsync : getMessagePolyfill;

