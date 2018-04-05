const request = require("request")

function main(params) {
  var options = {
    url: "http://api.funtranslations.com/translate/shakespeare.json",
    qs: {text: params.text, api_key: params.apiKey ? params.apiKey : ''},
    json: true
};
console.log(options);
return new Promise(function (resolve, reject) { request(options, function (err, resp) {
    if (err) {
        reject({error: err})
	  }
	  console.log(JSON.stringify(resp))
      resolve({payload: resp.body.contents.translated});
    });
}); };