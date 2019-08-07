
var KEY_TAB    = 9;
var KEY_DELETE = 8;
var KEY_ENTER  = 13;
var KEY_ESCAPE = 27;

jQuery.fn.extend({
    exists: function() {
        return this.length > 0;
    }
});

function showWorking() {
    $('#working-gif').show();
}

function hideWorking() {
    $('#working-gif').hide();
}

var workingCount = 0;
function pushWorking() {
    workingCount += 1;
    showWorking();
}

function popWorking() {
    workingCount -= 1;
    if ( workingCount < 0 ) {
        workingCount = 0;
    }
    if ( workingCount == 0 ) {
        hideWorking();
    }
}

function popAnd(f) {
    return function(data) {
        popWorking();
        if ( f ) { f(data); }
    }
}

function whileWorking(callback) {
    try {
        pushWorking();
        callback();
    } finally {
        popWorking();
    }
}

function POST(url, data, onComplete) {
    pushWorking();
    $.ajax({type: 'POST',
            contentType: 'application/json; charset=utf-8',
            url: url,
            data: JSON.stringify(data),
            dataType: 'json',
            success: popAnd(onComplete),
            failure: popWorking
           });
}

function PUT(url, data, onComplete) {
    pushWorking();
    $.ajax({type: 'PUT',
            contentType: 'application/json; charset=utf-8',
            url: url,
            data: JSON.stringify(data),
            dataType: 'json',
            success: popAnd(onComplete),
            failure: popWorking
           });
}

function DELETE(url, onComplete) {
    pushWorking();
    $.ajax({type: 'DELETE',
            url: url,
            success: popAnd(onComplete),
            failure: popWorking
           });
}

function GET(url, onComplete) {
    pushWorking();
    $.ajax({type: 'GET',
            contentType: 'application/json; charset=utf-8',
            url: url,
            dataType: 'json',
            success: popAnd(onComplete),
            failure: popWorking
           });
}

function getImage(imageId, callback) {
    GET('/js/image/' + imageId, function(data) {
        callback(data.image);
    });
}

function tagImage(imageId, tag, onComplete) {
    PUT('/image/' + imageId + '/tag/'+ tag,
        {tag: tag},
        onComplete);
}

function unTagImage(imageId, tag, onComplete) {
    DELETE('/image/' + imageId + '/tag/'+ tag, onComplete);
}

function deleteImage(imageId, onComplete) {
    DELETE('/image/' + imageId, onComplete);
}

function restoreImage(imageId, onComplete) {
    POST('/image/' + imageId,
         {action: 'restore'},
         onComplete);
}

function unclassifyImage(imageId, onComplete) {
    POST('/image/' + imageId,
         {action: 'restore'},
         onComplete);
}

function markImage(imageId, onComplete) {
    POST('/image/' + imageId,
         {action: 'mark', instructive: true},
         onComplete);
}

function unMarkImage(imageId, onComplete) {
    POST('/image/' + imageId,
         {action: 'mark', instructive: false},
         onComplete);
}

function commonPrefix(a, b) {
    if ( a.charAt(0) != b.charAt(0) ) {
        return null;
    }

    if ( a.startsWith(b) ) {
        return b;
    }

    if ( b.startsWith(a) ) {
        return a;
    }

    var len = Math.min(a.length, b.length);
    var prefix = '';
    for ( var i = 0; i < len; i++ ) {
        var ca = a.charAt(i);
        var cb = b.charAt(i);
        if ( ca == cb ) {
            prefix += ca;
        } else {
            break;
        }
    }
    return prefix;
}

function sortaMatches(text, search) {
    if ( text == search ) { return true; }
    var prefix = commonPrefix(text, search);
    if ( !prefix || prefix.length < 2 ) {
        return false;
    }
    if ( prefix == search ) {
        return true;
    }
    var searchRemainder = search.substring(prefix.length);
    var textRemainder = text.substring(prefix.length);
    return textRemainder.indexOf(' ' + searchRemainder) != -1 ||
        textRemainder.indexOf('-' + searchRemainder) != -1;
}

function hashParameters() {
    var hash = window.location.hash.substr(1);
    var kvs = hash.split(';');
    var params = {};
    kvs.forEach(function(kv) {
        var keyAndValue = kv.split('=');
        if ( keyAndValue.length != 2 ) {
            return;
        }
        params[keyAndValue[0]] = keyAndValue[1];
    });
    return params;
}

function setHashParameters(params) {
    var hash = "#";
    Object.keys(params).forEach(key => {
        var val = params[key];
        if ( hash.length > 1 ) {
            hash += ";";
        }
        hash += key + '=' + val;
    });
    history.replaceState(params, params.title || "Updated", hash);
}

function clearHashParameters() {
    history.pushState({}, "Cleared", "#");
}

function hashParameter(key) {
    return hashParameters()[key];
}

function setHashParameter(key, value) {
    var params = hashParameters();
    if ( params[key] != value ) {
        params[key] = value;
        setHashParameters(params);
    }
}

function removeHashParameter(key) {
    var params = hashParameters();
    if ( params[key] ) {
        delete params[key];
        setHashParameters(params);
    }
}

function simpleReplace(template, data) {
    var ret = template;
    Object.keys(data).forEach(function(key) {
        var regex = RegExp('\{\{'+key+'\}\}', 'g');
        ret = ret.replace(regex, data[key]);
    });
    return ret;
}

function flash() {
    $('#content').addClass('flashing');
    setTimeout(function() { $('#content').removeClass('flashing'); }, 150);
}

function goToClassify() {
    window.location = '/classify';
}

function goToTagging() {
    window.location = '/browse';
}

function goToResults() {
    window.location = '/train';
}

function scrollToTop() {
    $('html,body').animate({scrollTop: 0});
}

var goRoutes = {c: goToClassify,
                t: goToTagging,
                r: goToResults,
                a: scrollToTop};

var keyMappings = {};
var keyCodeMappings = {};

function go(event) {
    event.preventDefault();
    globalKeyHandler = null;

    var fun = goRoutes[event.key];
    if ( fun ) {
        fun(event);
    } else {
        flash();
    }
}

function startGo(event) {
    event.preventDefault();
    globalKeyHandler = go;
}

var globalKeyHandler = null;

function globalKeyDown(event) {
    var $target = $(event.target);
    if ( !$target.is('body') ) {
        globalKeyDown = null;
        return;
    }

    var mappings = {g: startGo};
    var ctrlKeyMappings = {};

    if ( event.ctrlKey ) {
        var fun = ctrlKeyMappings[event.key];
        if ( fun ) {
            fun(event);
        }
        return;
    }

    if ( globalKeyHandler ) {
        event.stopPropagation();
        globalKeyHandler(event);
        return;
    }

    var fun = mappings[event.key] || keyMappings[event.key] || keyCodeMappings[event.keyCode];
    if ( fun ) {
        fun(event);
    }
}

$(function() {
    $(window).keydown(globalKeyDown);
});
