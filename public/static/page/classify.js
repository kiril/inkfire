
function getId() {
    return $("#image-id").data("id");
}

function tag(style, addOrRemove, onComplete) {
    console.log((addOrRemove?"":"un-")+"tag " + style);
    var styles = [style];

    const styleMappings = {
        'american': ['illustrative'],
        'neo-american': ['illustrative'],
        'japanese': ['illustrative'],
        'neo-japanese': ['illustrative'],
        'bookish': ['illustrative', 'fine', 'sepia'],
        'mambo': ['heavy', 'color', 'blackwork', 'flat', 'illustrative'],
        'new school': ['illustrative', 'color', 'cartoon'],
        'hipster': ['blackwork', 'illustrative', 'heavy'],
        'anime': ['illustrative'],
        'manga': ['illustrative'],
        'engraving': ['illustrative'],
        'photorealistic': ['realistic'],
        'diamond': ['frame'],
        'triangle': ['frame'],
        'square': ['frame'],
        'cartoon': ['illustrative'],
        'french': ['linework', 'illustrative']
    };

    if ( addOrRemove ) {
        Object.keys(styleMappings).forEach(function(aStyle) {
            if ( style == aStyle ) {
                styleMappings[aStyle].forEach(function(additional) {
                    styles.push(additional);
                });
            }
        });
    }

    var data = {};
    data[addOrRemove ? "add" : "remove"] = styles;

    $.ajax({
        type: "POST",
        contentType: "application/json; charset=utf-8",
        url: '/image/' + getId() + '/classify/style',
        data: JSON.stringify(data),
        dataType: "json",
        success: function(data) {
            if ( onComplete ) {
                onComplete(styles);
            }
        }
    });
}

function toggle(action) {
    var $el = $(action.target);
    var name = $el.attr("name");
    var checked = $el[0].checked;
    var imageId = getId();

    tag(name, checked)
}

function goToNext() {
    var params = getUrlVars();
    var to = '';
    if ( params.batch ) {
        to = '/batch/' + params.batch + '/classify';
    } else {
        to = '/classify';
        if ( params['motif'] ) {
            to += '?motif='+params['motif'];
        } else if ( params['style'] ) {
            to += '?style='+params['style'];
        } else if ( params['status'] ) {
            to += '?status='+params['status'];
        }
    }
    window.location.href = to;
}

function deleteImage() {
    $.ajax({
        type: "DELETE",
        url: '/image/' + getId(),
        success: goToNext
    });
}

function restoreImage() {
    $.post('/image/' + getId(),
           {action: 'restore'},
           function() {
               updateStatus('unclassified');
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
    markInstructive(!isInstructive)
}

function reset() {
    $("#custom-style").val("");
    $(".style-outer").show();
    sortStyles();
}

function add() {
    update(true);
}

function remove() {
    update(false);
}

function update(addOrRemove) {
    var name = $("#custom-style").val().trim();
    if ( !name || !name.trim() ) {
        reset();
        return;
    }

    var $existing = $('.style[name="'+name+'"]');

    if ( $existing.length == 1 ) {
        var isChecked = $existing[0].checked;
        if ( isChecked ) {
            $existing.parent('.style-outer').find('.tag').removeClass('text-primary');
        } else {
            $existing.parent('.style-outer').find('.tag').addClass('text-primary');
        }
    }

    tag(name, addOrRemove, function(styles) {
        styles.forEach(function(style) {
            $('.style[name="'+style+'"]').prop("checked", addOrRemove);
        });

        if ( $existing.length == 0 ) {
            var $new = $($(".style-outer")[0]).clone();
            $new.find("input").attr("name", name).attr("checked", true).data("alias", "");
            $new.find(".tag").text(name);
            $("#styles").append($new);
        }

        if ( !$("#custom-style").val().trim() ) {
            sortStyles();
        }
    });

    reset();
}

function updateStatus(status) {
    var $status = $("#status");
    $status.text(status);
    if ( status == 'complete' ) {
        $status.removeClass('text-danger text-secondary').addClass('text-info');
    } else if ( status == 'deleted' ) {
        $status.removeClass('text-secondary text-info').addClass('text-danger');
    } else if ( status == 'unclassified' ) {
        $status.removeClass('text-info text-danger').addClass('text-secondary');
    }
}

function markComplete() {
    $.post('/image/' + getId(),
           {action: 'complete'},
           function() {
               updateStatus('complete');
           }
          )
}

function markCompleteAndContinue() {
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

var KEY_ENTER = 13;
var KEY_TAB = 9;
var KEY_DELETE = 8;

function keydown(event) {
    if ( event.which != KEY_TAB && event.which != KEY_ENTER ) {
        return;
    }

    var text = $(event.target).val();
    if ( !text || text.trim().length == 0 || event.shiftKey ) {
        return;
    }

    var found = [];
    $(".style-outer").each(function(i) {
        var $el = $(this);
        var name = $el.find(".style").data('alias') || $el.find(".style").attr("name");
        if ( name.indexOf(text) != -1 ) {
            found.push($el);
        }
    });

    if ( found.length == 1 && !event.ctrlKey ) {
        var autoCompleteName = found[0].find(".style").data("alias") || found[0].find(".style").attr("name");
        if ( autoCompleteName.length > text.length ) {
            $(event.target).val(autoCompleteName);
            filterDisplayed(autoCompleteName);
        }
        event.preventDefault();
    }
}

function autocompleteFirst(event) {
    var text = $("#custom-style").val().trim();
    if ( !text || text.trim().length == 0 ) {
        return;
    }

    var exact = false;
    var found = [];
    var $best = $(".style-outer:first");

    if ( $best.is(":visible") ) {
        var name = $best.find('.style').data('alias') || $best.find(".style").attr("name");
        $(event.target).val(name);
        event.shiftKey ? remove() : add();
    }
}

function keyup(event) {
    if ( event.which == KEY_ENTER ) {
        if ( ! event.ctrlKey ) {
            autocompleteFirst(event);
            event.preventDefault();

        } else {
            if ( event.shiftKey ) {
                remove();
            } else {
                add();
            }
            event.preventDefault();
        }

    } else {
        var text = $(event.target).val();
        filterDisplayed(text);
    }
}

function filterDisplayed(text) {
    if ( !text || text.trim().length == 0 ) {
        reset();
        return;
    }

    var $elements = [];

    $(".style-outer")
        .hide()
        .each(function(i) {
            $elements.push($(this));
        })
        .removeClass('bg-primary text-white')
        .remove();

    $elements.sort(function($a, $b) {
        var aName = $a.find(".style").data("alias") || $a.find(".style").attr("name");
        var bName = $b.find(".style").data("alias") || $b.find(".style").attr("name");

        if ( text == aName ) {
            return -1;
        }

        if ( text == bName ) {
            return 1;
        }

        var aStarts = aName.startsWith(text);
        var bStarts = bName.startsWith(text);
        var aHas = aName.indexOf(text) != -1;
        var bHas = bName.indexOf(text) != -1;
        var aSorta = sortaMatches(aName, text);
        var bSorta = sortaMatches(bName, text);

        if ( aStarts && !bStarts ) {
            return -1;
        }

        if ( bStarts && !aStarts ) {
            return 1;
        }

        if ( aHas && !bHas ) {
            return -1;
        }

        if ( bHas && !aHas ) {
            return 1;
        }

        if ( aSorta && !bSorta ) {
            return -1;
        }

        if ( bSorta && !aSorta ) {
            return 1;
        }

        return aName < bName ? -1 : 1;
    });

    if ( $elements.length > 0 ) {
        $elements[0].addClass('bg-primary text-white');
    }

    $elements.forEach(function($el) {
        var isPrimary = $el === $elements[0];

        var name = $el.find('.style').data('alias') || $el.find('.style').attr('name');
        var matchIndex = name.indexOf(text);
        if ( matchIndex != -1 ) {
            var beforeMatch = name.substring(0, matchIndex);
            var afterMatch = name.substring(matchIndex+text.length);
            var muted = isPrimary ? "text-white" : "text-secondary";
            var important = isPrimary ? "font-weight-bold text-white" : "font-weight-bold";
            var html = '<span class="'+muted+'">'+beforeMatch+'</span><span class="'+important+'" style="text-decoration:underline;">'+text+'</span><span class="'+muted+'">'+afterMatch+'</span>';
            $el.find('.tag').html(html);
            $el.show();
        } else if ( sortaMatches(name, text) ) {
            var prefix = commonPrefix(name, text);
            var remainder = text.substring(prefix.length);
            var remainderIndex = name.indexOf(remainder, prefix.length+1);
            var between = name.substring(prefix.length, remainderIndex);
            var after = name.substring(remainderIndex+remainder.length);
            var muted = isPrimary ? "text-white" : "text-secondary";
            var important = isPrimary ? "font-weight-bold text-white" : "font-weight-bold";
            var html = '<span class="'+important+'" style="text-decoration:underline;">'+prefix+'</span><span class="'+muted+'">'+between+'</span><span class="'+important+'" style="text-decoration:underline;">'+remainder+'</span><span class="'+muted+'">'+after+'</span>';
            $el.find('.tag').html(html);
            $el.show();
        }
        $('#styles').append($el);
    });
}

function sortStyles() {

    var $elements = [];
    $(".style-outer").hide()
        .removeClass('bg-primary text-white')
        .each(function(i) {
            var $el = $(this);
            var name = $el.find(".style").data("alias") || $el.find(".style").attr("name");
            $el.find(".tag").text(name);
            $elements.push($el);
        })
        .remove();

    $elements.sort(function($a, $b) {
        var aIsChecked = $a.find('input')[0].checked;
        var bIsChecked = $b.find('input')[0].checked;
        if ( aIsChecked && !bIsChecked ) {
            return -1;
        } else if ( bIsChecked && !aIsChecked ) {
            return 1;
        }

        var aIsPredicted = $a.find('.tag.predicted').length > 0;
        var bIsPredicted = $b.find('.tag.predicted').length > 0;
        if ( aIsPredicted && !bIsPredicted ) {
            return -1;
        }
        if ( bIsPredicted && !aIsPredicted ) {
            return 1;
        }

        var aWasContemplated = $a.find('.tag.contemplated').length > 0;
        var bWasContemplated = $b.find('.tag.contemplated').length > 0;
        if ( aWasContemplated && !bWasContemplated ) {
            return -1;
        }
        if ( bWasContemplated && !aWasContemplated ) {
            return 1;
        }

        return $a.find(".tag").text() < $b.find(".tag").text() ? -1 : 1;
    });

    $elements.forEach(function($el) {
        var isChecked = $el.find('input')[0].checked;
        if ( isChecked ) {
            $el.find('.tag').addClass('text-primary');
        } else {
            $el.find('.tag').removeClass('text-primary');
        }
        $("#styles").append($el);
        $el.show();
    });
}


$(function() {
    sortStyles();
    $(".style").change(toggle);

    $("#delete-button").click(deleteImage);
    $("#restore-button").click(restoreImage);
    $("#complete-button").click(markComplete);
    $("#toggle-instructive-button").click(toggleInstructive);
    $("#custom-style")
        .keydown(keydown)
        .keyup(keyup)
        .blur(function() { setTimeout(function() { reset(); }, 200) });

    var keyMappings = {c: markComplete,
                       d: deleteImage,
                       n: goToNext,
                       y: markCompleteAndContinue,
                       u: restoreImage,
                       s: function() { $("#custom-style").focus() }};

    $(window).keydown(function(e) {
        if ( e.ctrlKey ) {
            e.preventDefault();
            var fun = keyMappings[e.key];
            if ( fun ) {
                fun();
            }
        }
    });

    setTimeout(function() {
        $("#custom-style").focus();
    }, 250);
});
