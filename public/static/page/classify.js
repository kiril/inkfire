
function getId() {
    return $("#image-id").data("id");
}

function tag(category, id, addOrRemove, onComplete) {

    var data = {};
    data["category"] = category;
    data["id"] = id;
    data["tag"] = addOrRemove;

    $.ajax({
        type: "POST",
        contentType: "application/json; charset=utf-8",
        url: '/image/' + getId() + '/classify',
        data: JSON.stringify(data),
        dataType: "json",
        success: function(data) {
            if ( onComplete ) {
                onComplete();
            }
        }
    });
}

function toggle(action) {
    var $el = $(action.target);
    var isStyle = $el.hasClass("style");
    var name = $el.attr("name");
    var checked = $el[0].checked;
    var imageId = getId();

    var category = isStyle ? "style" : "motif";

    tag(category, name, checked)
}

function goToNext() {
    var params = getUrlVars();
    var to = '/classify';
    if ( params['motif'] ) {
        to += '?motif='+params['motif'];
    } else if ( params['style'] ) {
        to += '?style='+params['style'];
    }
    window.location.href = to;
}

function deleteImage() {
    maybe("Are you sure you want to mark delted?",
          function () {
              $.ajax({
                  type: "DELETE",
                  url: '/image/' + getId(),
                  success: goToNext
              })
          })
}

function restoreImage() {
    maybe("Restore image?",
          function() {
              $.post('/image/' + getId(),
                     {action: 'restore'},
                     function() {
                         window.location.reload();
                     }
                    );
          });
}

function markInstructive(yesOrNo) {
    $.post('/image/' + getId(),
           {action: 'mark', instructive: yesOrNo},
           function() {
               window.location.reload();
           });
}

function toggleInstructive() {
    var isInstructive = $("#toggle-instructive-button").data("instructive") == true;
    console.log("instructive", $("#toggle-instructive-button").data("instructive"), isInstructive);
    markInstructive(!isInstructive)
}

function reset(type) {
    $("#custom-"+type).val("");
    $("."+type+"-outer").show();
}

function add(type) {
    update(type, true);
}

function remove(type) {
    update(type, false);
}

function update(type, addOrRemove) {
    var name = $("#custom-"+type).val().trim();
    if ( !name || !name.trim() ) {
        reset(type);
        return;
    }

    console.log("adding ", type, name, addOrRemove);

    var $existing = $('.'+type+'[name="'+name+'"]');

    tag(type, name, addOrRemove, function() {
        if ( $existing.length > 0 ) {
            $existing.prop("checked", addOrRemove);

        } else if ( addOrRemove ) {
            var $new = $($("."+type+"-outer")[0]).clone();
            $new.find("input").attr("name", name).attr("checked", true);
            $new.find(".tag").text(name);
            $("#"+type+"s").append($new);
        }
    });

    reset(type);
}

function markComplete() {
    $.post('/image/' + getId(),
           {action: 'complete'},
           goToNext);
}

function getUrlVars()
{
    var vars = [], hash;
    var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
    for(var i = 0; i < hashes.length; i++)
    {
        hash = hashes[i].split('=');
        vars.push(hash[0]);
        vars[hash[0]] = hash[1];
    }
    return vars;
}

function maybe(msg, onConfirm) {
    if ( confirm(msg) ) {
        onConfirm()
    }
}

var KEY_ENTER = 13;
var KEY_TAB = 9;
var KEY_DELETE = 8;

function keydown(type, event) {
    if ( event.which != KEY_TAB && event.which != KEY_ENTER ) {
        return;
    }

    var text = $(event.target).val();
    if ( !text || text.trim().length == 0 || event.shiftKey ) {
        return;
    }

    var found = [];
    $("."+type+"-outer").each(function(i) {
        var $el = $(this);
        var name = $el.find("."+type).attr("name");
        if ( name.indexOf(text) != -1 ) {
            found.push($el);
        }
    });

    if ( found.length == 1 && !event.ctrlKey ) {
        var autoCompleteName = found[0].find("."+type).attr("name");
        if ( autoCompleteName.length > text.length ) {
            $(event.target).val(autoCompleteName);
            typing(type, autoCompleteName);
        }
        event.preventDefault();
    }
}

function autocompleteFirst(type, event) {
    var text = $("#custom-"+type).val().trim();
    if ( !text || text.trim().length == 0 ) {
        return;
    }

    var exact = false;
    var found = [];
    $("."+type+"-outer").each(function(i) {
        var $el = $(this);
        var name = $el.find("."+type).attr("name");
        if ( name.indexOf(text) != -1 ) {
            if ( name == text ) {
                exact = true;
            }
            found.push($el);
        }
    });

    if ( exact ) {
        if ( event.shiftKey ) {
            remove(type);
        } else {
            add(type);
        }
        return;
    }

    if ( found.length > 0 ) {
        var autoCompleteName = found[0].find("."+type).attr("name");
        if ( autoCompleteName.length >= text.length ) {
            $(event.target).val(autoCompleteName);
            if ( event.shiftKey ) {
                remove(type);
            } else {
                add(type);
            }
        }
    }
}

function keyup(type, event) {
    if ( event.which == KEY_ENTER ) {
        if ( ! event.ctrlKey ) {
            console.log("no ctrl...");
            autocompleteFirst(type, event);
            event.preventDefault();

        } else {
            console.log("ctrl...");
            if ( event.shiftKey ) {
                remove(type);
            } else {
                console.log("add()");
                add(type);
            }
            event.preventDefault();
        }

    } else {
        var text = $(event.target).val();
        typing(type, text);
    }
}

function typing(type, text) {
    if ( !text || text.trim().length == 0 ) {
        reset(type);
        return;
    }

    $("."+type+"-outer")
        .hide()
        .each(function(i) {
            var $el = $(this);
            var name = $el.find("."+type).attr("name");
            if ( name.indexOf(text) != -1 ) {
                $el.show();
            }
        });
}

$(function() {
    $(".style").change(toggle);
    $(".motif").change(toggle);

    $("#delete-button").click(deleteImage);
    $("#restore-button").click(restoreImage);
    $("#complete-button").click(markComplete);
    $("#toggle-instructive-button").click(toggleInstructive);

    $("#custom-motif")
        .keydown(function(e) { keydown("motif", e); })
        .keyup(function(e) { keyup("motif", e); })
        .blur(function() { setTimeout(function() {reset("motif");}, 200) });
    $("#custom-style")
        .keydown(function(e) { keydown("style", e); })
        .keyup(function(e) { keyup("style", e); })
        .blur(function() { setTimeout(function() { reset("style"); }, 200) });

    $(window).keydown(function(e) {
        if ( e.ctrlKey ) {
            e.preventDefault();
            if ( e.key == 'y' ) {
                markComplete();
            } else if ( e.key == 'n' ) {
                deleteImage();
            } else if ( e.key == 's' ) {
                $("#custom-style").focus();
            } else if ( e.key == 'm' ) {
                $("#custom-motif").focus();
            }
        }
    });

    setTimeout(function() {
        $("#custom-style").focus();
    }, 250);
});
