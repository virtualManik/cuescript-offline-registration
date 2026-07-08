var request = require('request');
var fs = require('fs');

if( process.argv.length < 4 )
{
	console.log("Proper Usage:");
	console.log("node main.js <Serial Number> <Customer Email> [renew]");
	return;
}

if( process.argv[2].length != 10 )
{
	console.log("Error: Serial number is not valid");
	return;
}

var serialNum = process.argv[2];
var email = process.argv[3];
var renew = (process.argv[4] == "renew");
var regInfo = "";

var req = request.post({
	url: 'https://www.cuescript.tv/catalog/software_registration_successful.php',
	formData: {
		manualRegister: "CueiT",
		serial: serialNum,
		email: email,
		renew: renew.toString()
	}
},function (err, resp, body) {
  if (err) {
    console.log(err);
    console.log('Error retrieving registration data');
  } else {
    console.log('Retrieved registration data...');
	regInfo = body;
	
	try
	{
		var crypt = require("crypto");
		key =  new Buffer("0-3.4=q!Yg#{oWo:8)evq(zh9<^qBi6r", 'binary');
		var decipher = crypt.createDecipheriv('aes-256-cbc', key.toString('binary'), '\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0');
		var decryptedContent = decipher.update(regInfo, 'base64', 'utf8');
		decryptedContent = decryptedContent + decipher.final('utf8');
		
		var regObject = JSON.parse(decryptedContent);
		console.log('Registration information:');
		console.log('Serial Number: '+regObject.serial);
		console.log('Flavor: '+regObject.flavor);
		console.log('Addons: '+regObject.addons);
		console.log('Expiration: '+new Date(regObject.regEndDate));
		
		var regFileName = "./OLR-"+serialNum+".csr";
		fs.writeFile(regFileName, regInfo, function(err) {
			if(err) {
				console.log(err);
				console.log('Error writing registration file');
				return;
			}

			console.log("Registration file saved: "+ regFileName);
		}); 
	}
	catch(e)
	{
		console.log('Error: ', body);		
	}
  }
});

