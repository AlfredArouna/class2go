var c2gXMLParse = c2gXMLParse || {};

/**
 * Transform text into a URL slug: spaces turned into dashes, remove non alnum
 * @param string text
 * Credit: http://milesj.me/snippets/javascript/slugify
 */

c2gXMLParse.slugify = function (text) {
	text = text.replace(/[^-a-zA-Z0-9\s]+/ig, '');
	text = text.replace(/-/gi, "_");
	text = text.replace(/\s/gi, "-");
	return text.substr(0,100);
}

c2gXMLParse.parseQuizDown = function () {
    var csrftoken = '{{ csrf_token }}';
    $.ajax("{% url 'parse_markdown' %}",
           {
               headers: {'X-CSRFToken': csrftoken },
               type: "POST",
               data: {
                    'markdown':$("#quizdown-entry").val()
               },
               error: function() {
                    alert('A error (likely network-related) occurred during the quizdown conversion.\nPlease check your Internet connection and try again.');
               },
               success: function(data) {
                   var obj=JSON.parse(data);
                    console.log(obj.meta);
                   c2gXMLParse.importMeta(obj.meta);
                   c2gXMLParse.markdown2quiz(obj.html);
               }
               
           });

}




c2gXMLParse.importMeta = function (meta) {
    for (key in meta) {
        var value = meta[key][0];
        var k = key.trim().toLowerCase();
        var kslug = c2gXMLParse.slugify(k);
        console.log( k + " , " + kslug);
        if (k == "title") {
            $('#exam_title').val(value);
            $('#exam_slug').val(c2gXMLParse.slugify(value));
        }
        else if (k == "slug") {
            $('#exam_slug').val(value);
        }
        else if (k == "due_date"             || kslug == "due_date"             ||
                 k == "grace_period"         || kslug == "grace_period"         ||
                 k == "hard_deadline"        || kslug == "hard_deadline"        ||
                 k == "assessment_type"      || kslug == "assessment_type"      ||
                 k == "late_penalty"         || kslug == "late_penalty"         ||
                 k == "num_subs_permitted"   || kslug == "num_subs_permitted"   ||
                 k == "resubmission_penalty" || kslug == "resubmission_penalty" ||
                 k == "description") {
            $('#'+kslug).val(value);
        }
        else if (k == "invideo" && value.toLowerCase() != "false") {
            $('#invideo_id')[0].checked=true;
        }
        else if (k == "section") {
            $('#id_section option').each(function() {
                                              //Go through each option to see if any of their text is the same as the XML
                                              //select if that's the case
                                              if ($(this).text() && value && $(this).text().trim() == value.trim())
                                                  $('#id_section').val($(this).val());
                                              });
        }
        
    }
}

//The quizdown parser operates on HTML generated by the markdown parser.  It does not
//parse markdown itself.
c2gXMLParse.markdown2quiz = function (html_text) {
    
    var inputTypes = {  'NUMBER':"numericalresponse",
                        'TEXT':"stringresponse",
                        'REGEX':"regexresponse",
                        'TEXTAREA':"stringresponse" };
    
    //Create the metadata DOM so it can be built up and be avaiable in the
    //namespace of this function.
    var outer_mDOM = $("<metadata><exam_metadata></exam_metadata></metadata>");
    var mDOM = $(outer_mDOM).find("exam_metadata");
    
    /**** Declare local helper functions ****/
    
    //Changes <ul>, <ol> into checkbox or radio or select
    var transform_lists = function (list, answerlist, qnum, ordinal) {
        var qID = $(list).closest('div.question').attr('id');
        console.log(qID);
        var choices = $(list).find("li");
        var wrapperElem;
        var qname = "Q"+ qnum + "_MC" + ordinal;
        var type;
        var choiceOrd = 0;        
        var qslug = c2gXMLParse.slugify($(list).prev("p").text());
        
        //Do the display HTML
        if (choices.length <= 5) {
            type = $(list).is("ol")?"radio":"checkbox";
            wrapperElem = $("<fieldset></fieldset>");
            wrapperElem.attr("data-report", qslug).attr("name", qname);
            choiceOrd = 0;
            choices.each(function() {
                            choiceOrd += 1;
                            var choiceID = qname + "_" + choiceOrd;
                            var label=$("<label></label>");
                            label.attr('for', choiceID);
                            var input=$("<input></input>");
                            input.attr('name', qname)
                                 .attr('type', type)
                                 .attr('id', choiceID)
                                 .attr('data-report', c2gXMLParse.slugify($(this).text()))
                                 .attr('value', choiceOrd);
                            label.append(input).append($(this).html());
                            wrapperElem.append(label);
                         });
        }
        else {
            wrapperElem = $("<select></select>");
            wrapperElem.attr("data-report", qslug).attr("name", qname);
            choiceOrd = 0;
            var blankOption = $("<option></option>");
            blankOption.attr('name', qname)
                       .attr('id', qname + "_0")
                       .attr('data-report', "blank option")
                       .attr('value', 0)
                       .text('');
            wrapperElem.append(blankOption);
            choices.each(function() {
                            choiceOrd += 1;
                            var choiceID = qname + "_" + choiceOrd;
                            var option = $("<option></option>");
                            option.attr('name', qname)
                                  .attr('id', choiceID)
                                  .attr('data-report', c2gXMLParse.slugify($(this).text()))
                                  .attr('value', choiceOrd)
                                  .text($(this).text());
                            wrapperElem.append(option);
                         });
            
            
        }
        $(list).before(wrapperElem);
        $(list).remove();
        
        //Now do the metadata
        var resp = $('<response answertype="multiplechoiceresponse"></response>');
        choiceOrd = 0;
        resp.attr('name', qname).attr('data-report', qslug);
        var numCorrect = 0;
        $(answerlist).find("li").each(function(){
            var regex = /^(correct|right)\./i;
            var correct = regex.test($(this).text());
            if (correct) numCorrect += 1;
            choiceOrd += 1;
            var choiceID = qname + "_" + choiceOrd;
            var choice = $("<choice></choice>");
            choice.attr('value',choiceOrd)
                  .attr('data-report', wrapperElem.find("#"+choiceID).attr('data-report'))
                  .attr('correct', (correct)?'true':'false');
            var explanation = $("<explanation>" + $(this).text() + "</explanation>");
            choice.append(explanation);
            resp.append(choice);            
        });
        //If more than 1 correct answer, do multi-select
        if (wrapperElem.is("select") && numCorrect > 1) {
            wrapperElem.attr("multiple", "multiple");
        }
        mDOM.find("question_metadata#"+qID).append(resp);

    };
    
    //Function to make <a> elements into inputs
    var transform_a = function(aElem, qnum, ordinal, type){
        var qID = $(aElem).closest('div.question').attr('id');
        console.log(qID);
        var qname = "Q"+ qnum + "_SA" + ordinal;
        var qslug = c2gXMLParse.slugify($(aElem).closest("p").text());
        
        //Setup the display HTML
        var inputElem;
        if (type !== "TEXTAREA") {
            inputElem = $('<input type="text" size="20" />');
        }
        else {
            inputElem = $('<textarea></textarea>');
        }
        inputElem.attr('id', qname)
                 .attr('name', qname)
                 .attr('data-report', qslug);
        
        $(aElem).before(inputElem);
        
        //Now do the metadata
        var answertext = "";
        if ($(aElem).attr('title') == undefined) {
            var regexMatch = /\(.*\)/.exec($(aElem).attr('href'));
            console.log(regexMatch);
            if (regexMatch) {
                answertext = regexMatch[0].substr(1, regexMatch[0].length-2);
            }
        }
        else {
            answertext = $(aElem).attr('title');
        }
        
        $(aElem).remove();  //Moved so that we remove aElem after all references to it

        console.log(answertext);
        var resp = $('<response answertype="' + inputTypes[type] + '"></response>');
        resp.attr('id', qname)
            .attr('name', qname)
            .attr('data-report', qslug);
        if (type == "NUMBER") {
            var tolI = answertext.indexOf("+-");
            if (tolI > -1) {
                var answer = answertext.substr(0, tolI).trim();
                console.log(answer);
                var tolString = answertext.substr(tolI+2, answertext.length).trim();
                console.log(tolString);
                var tolElem = $('<responseparam type="tolerance" default="' + tolString + '"></responseparam>');
                resp.append(tolElem);
            }
            else {
                var answer = answertext.trim();
            }
            resp.attr('answer',answer);
        }
        else if (type == "TEXT" || type == "TEXTAREA") {
            var answer = answertext.trim();
            resp.attr('ignorecase','true')
                .attr('answer',answer);
        }
        else if (type == "REGEX") {
            var answer = answertext.trim();
            resp.attr('answer',answer);
            var param = $('<responseparam flag="IGNORECASE" />');
            resp.append(param);
        }
        
        if (answertext != "") {
            mDOM.find("question_metadata#"+qID).append(resp);
        }
    };
    //Function to parse all questions
    var parseQuestion = function(qDiv, qnum) {
        /* qDiv = <div> element containing the question.
           qnum = ordinal numbering of question
         */
        /* Overall logic
         0. Give the question a number
         1. Parse out answers and explanations
         2. Do multiple choice
             * ul -> checkbox
             * ol -> radio
             * ul or ol more than 5 -> select
             * Generate xml_metadata
                 - add multi to select
         3. Do short answers
             * a -> input
         */
        
        var q = $(qDiv);
        var q_meta = mDOM.find("question_metadata").eq(qnum-1);
        //Number the question
        q.find("h3.questionNumber").prepend('<span>Question ' + qnum +':  </span>');
        
        //Set IDs
        var qID = "problem_"+qnum;
        q.attr("id", qID);
        q_meta.attr("id", qID);
        
        //Parse out answers
        var answer_headings = q.find('h2').filter(function() {
                                                  return $(this).text().trim().toUpperCase() === "ANSWER";
                                                  });
        var answers_dom = answer_headings.nextUntil(':not(ul, ol)');
        var mc_answers_dom = answers_dom.filter("ul, ol");
        var mc_answers = mc_answers_dom.clone();
        console.log(mc_answers.length);
        answer_headings.remove();
        answers_dom.remove();
        
        //Parse out explanations
        var explanation_headings = q.find('h2').filter(function() {
                                                       return $(this).text().trim().toUpperCase() === "EXPLANATION";
                                                       });
        var explanations_dom = explanation_headings.nextUntil('h2');
        var explanations = explanations_dom.clone();
        explanation_headings.remove();
        explanations_dom.remove();
        //Add explanation to metadata
        var sol = $('<solution></solution>');
        var solDiv = $('<div class="detailed-solution"></div>');
        solDiv.append(explanations);
        sol.append(solDiv);
        q_meta.append(sol);
        
        //radio / checkbox / select
        var ordinal=0;
        q.find("ul, ol").each(function () {ordinal+=1; transform_lists(this, mc_answers.eq(ordinal-1), qnum, ordinal); });
        
        //Inputs
        q.find("a").each(function() {
                             if ($(this).text().trim().toUpperCase() in inputTypes) {
                                 ordinal += 1;
                                 transform_a(this, qnum, ordinal, $(this).text().trim().toUpperCase());
                             }
                         });
        
    };
    
    var parseVideoAssoc = function(va) {
        var v=$(va);
        var videoHeadings = v.find('h2');
        videoHeadings.each(function() {
            var vidSlug = $(this).text()
            var qTitles = $(this).nextUntil('h2');
            var qLines = qTitles.text().split('\n');
            console.log(qLines);
            var vElem = $("<video />");
            vElem.attr('url-identifier', vidSlug);
            for (i=0; i < qLines.length; i++) {
                var curQ = qLines[i];
                var parts = curQ.split(":");
                var time = "";
                if (parts.length > 1) {
                    var where = parts[1].toUpperCase().indexOf("SEC");
                    if (where > -1) time = parts[1].substr(0, where).trim();
                    else time = parts[1].trim();
                }
                var sel = $('#staging-area div[data-report="' + c2gXMLParse.slugify(parts[0].trim()) + '"]');
                if (sel.length && time != "") {
                    var qElem = $("<question />");
                    qElem.attr("id", sel.eq(0).attr("id"))
                         .attr("time", time);
                    vElem.append(qElem);
                }
            }
            mDOM.prepend(vElem);

        });
    };
    /****  The actual actions performed by this function ******/
    $("#staging-area").empty();
    console.log(html_text);
    var qd = $(html_text);
    qd = qd.filter(function() {
                 //get rid of text nodes that are just whitespace
                 if(this.nodeType==3 && $(this).text().trim()==="") return false;
                 return true;
            });
    var qd_orig = qd.clone();
    console.log(qd);
    var firstChild = qd.first();
    var preamble = firstChild.add(firstChild.nextUntil('h1'));
    var content = qd.not(preamble);
    
    $("#staging-area").append(preamble.clone());
    
    var videoAssoc = $("<video></video>");
    var qnum = 0;

    //Questions are delimited at h1
    //Insert each question
    content.each(
        function() {
            if ($(this).is("h1") && $(this).text().trim().toUpperCase() != "VIDEO TIMES") {
                //First create the display HTML
                var myDiv = $('<div class="question"></div>');
                var slug = c2gXMLParse.slugify($(this).text().trim());
                myDiv.attr("data-report",slug).attr("title", $(this).text());
                var title = $('<h3 class="questionNumber"></h3>');
                $(title).html($(this).html());
                myDiv.append($(title));
                myDiv.append($(this).nextUntil("h1").clone());
                console.log(myDiv.html());
                $("#staging-area").append($(myDiv));
                 
                //Now create metadata
                var qDOM = $("<question_metadata></question_metadata>");
                qDOM.attr("data-report", slug);
                mDOM.append(qDOM);
            }
            else if ($(this).is("h1") && $(this).text().trim().toUpperCase() == "VIDEO TIMES") {
                videoAssoc.append($(this).clone());
                videoAssoc.append($(this).nextUntil("h1").clone());
            }

         });

    //Now parse each question, using the DOM already in the staging area
    $("#staging-area div.question").each( function() { qnum += 1; parseQuestion(this, qnum); });
    
    
    //Now associate videos
    parseVideoAssoc(videoAssoc);
    
    editor.setValue(style_html($("#staging-area").html(), {'max_char':80}));
    metadata_editor.setValue(style_html(outer_mDOM.html(), {'max_char':80}));
    var questionMD = $(mDOM).find('question_metadata');
    $(questionMD).each(function(){displayQuestionExplanation(this);
                                  displayChoiceExplanations(this, true);});
    MathJax.Hub.Queue(["Typeset",MathJax.Hub,"staging-area"]);


}

