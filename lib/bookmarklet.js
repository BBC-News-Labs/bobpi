var contentUrl="https://protected-forest-3723.herokuapp.com/crossover?callback=?&tags=";
$('#related_topics a').each(function(index){
    $(this).css("color","green");
      if (index == $('#related_topics a').length - 1) {
        contentUrl = contentUrl+$(this).html();
    } else {
        contentUrl = contentUrl+$(this).html()+",";
    }

  });

console.log(contentUrl);

$.getJSON(contentUrl, function(result){
    var outputMarkup = "<h2>BBC Smalltalk</h2>";
    var logoUrl = "https://protected-forest-3723.herokuapp.com/images/time.png";
    var outputMarkup = outputMarkup + "<p style='font-size:15px;padding-left:20px; background: url(\""+logoUrl+"\")no-repeat; background-size:15px'>History of this story</p>";
    
    for (var i = result.length - 1; i >= 0; i--) {
        outputMarkup += themeItem(result[i]);
    };

    $('#meta').last().append("<div class='bbc-smalltalk' style='position: absolute;  top: 50px;  right: 0px;  width: 170px; background:#fff; z-index:10007'>"+outputMarkup+"</div>"); 
});




function themeItem(dataObject) {
  //console.log("hier hier:")
  if (typeof dataObject.media.images.body !== 'undefined'){
    console.log(dataObject.media.images.body);
  
    if (typeof dataObject.media.images['index-thumbnail'] !== 'undefined'){
      for (var property in dataObject.media.images['index-thumbnail']) {
        if (dataObject.media.images['index-thumbnail'].hasOwnProperty(property)) {
            var imageSrc = dataObject.media.images['index-thumbnail'][property].href;
        }
      }
      var thedate = formatDate(dataObject.lastUpdated.substring(0,19));
      //var thedate = dataObject.lastUpdated.substring(0,19)+"Z";
      return "<div><article class=\"article\"><p style='color:grey;margin-bottom:1px'>"+thedate+"</p><a href=\"http://bbc.co.uk"+dataObject.assetUri+"\"><img style='width:170px' src='" + imageSrc + "'/><h3>"+dataObject.title+"</h3></a></article></div>";
    }
  }
  return "";
}

function formatDate(dateString) {
  var date = new Date(dateString);
  var month = new Array();
month[0] = "January";
month[1] = "February";
month[2] = "March";
month[3] = "April";
month[4] = "May";
month[5] = "June";
month[6] = "July";
month[7] = "August";
month[8] = "September";
month[9] = "October";
month[10] = "November";
month[11] = "December";
  //June 2, 2015 10.15pm
  return month[date.getMonth()] + ' ' + date.getDate() +", " + date.getFullYear() + " " + date.getHours() +":"+date.getMinutes()
}


