
function classify(imageId, style, addOrRemove, onComplete) {
    var styles = [style];

    var data = {};
    data[addOrRemove ? "add" : "remove"] = styles;

    $.ajax({
        type: "POST",
        contentType: "application/json; charset=utf-8",
        url: '/image/' + imageId + '/classify/style',
        data: JSON.stringify(data),
        dataType: "json",
        success: function(data) {
            if ( onComplete ) {
                onComplete(styles);
            }
        }
    });
}

function unTag(imageId, onComplete) {
    $.post('/image/' + imageId, {action: 'complete'}, onComplete);
}

function handleRemove(event) {
    event.preventDefault();
    var $el = $(event.target).parent('a');
    var imageId = $el.data('image-id').trim();
    var style = $el.data('style');

    classify(imageId, style, false, function() {
        $('.tag.'+imageId+'[data-name="'+style+'"]').remove();
        if ( $el.data('page-style').trim() == style ) {
            $('div.'+imageId).hide();
        }
    });
    return false;
}

function reset(imageId ) {
    $("input.add-style."+imageId).val("").blur();
}

function addStyleTag(imageId, style) {
    var pageStyle = $(".tag").data("page-style");
    var html = '<div class="small border p-1 mr-2 mb-2 tag bg-light float-left '+imageId+' '+style+'" data-name="'+style+'"style="inline-block">'+style+' <a data-page-style="'+pageStyle+'" data-style="'+style+'" data-image-id="'+imageId+'" class="small text-secondary remove '+imageId+'" href="#"><i class="fas fa-times-circle"></a></div>'
    $("."+imageId+" .gap").before(html);
    $('.tag.'+imageId+'[data-name="'+style+'"] a.remove').click(handleRemove);
}

function isExistingStyle(style) {
    return $('.existing-style[data-id="'+style+'"]').length > 0;
}

function isTagged(imageId, style) {
    return $('.tag.'+imageId+'[data-name="'+style+'"]').length > 0;
}

var KEY_ENTER = 13;
var KEY_TAB = 9;
var KEY_DELETE = 8;

function keydown(event) {
}

function add(imageId, style, callback) {
    if ( isTagged(imageId, style) ) {
        alert('Already tagged');
        return;
    }
    if ( !isExistingStyle(style) ) {
        alert('No such style "' + style + '"');
        return;
    }
    classify(imageId, style, true, function() {
        reset(imageId);
        addStyleTag(imageId, style);
        if ( callback ) {
            callback();
        }
    });
}

function keyup(event) {
    if ( event.which == KEY_ENTER ) {
        event.preventDefault();
        var imageId = $(event.target).data("image-id");
        var style = $(event.target).val().trim();
        add(imageId, style, function() {
            $(event.target).val("");
        });
    }
}

function handleQuickAdd(event) {
    var imageId = $(event.target).data('image-id');
    var style = $(event.target).data('style');
    add(imageId, style, function() {
        $(".quickadd."+imageId+"."+style).remove();
    });
}

$(function() {
    $("a.remove").click(handleRemove);
    $("input.add-style")
        .keydown(keydown)
        .keyup(keyup)
        .blur(function(event) {
            setTimeout(function() {
                $(event.target).val("");
            }, 200)
        });

    $('.quickadd').click(handleQuickAdd);
});
