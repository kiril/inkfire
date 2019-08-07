
function $selectedBatch() {
    return $('.batch.selected');
}

function select$($batch) {
    deselectBatch();
    $batch.addClass('selected');
}

function deselectBatch() {
    $selectedBatch().removeClass('selected');
}

function selectNextBatch() {
    var $batch = $selectedBatch();
    if ( $batch.exists() ) {
        var $next = $batch.next();
        if ( $next.exists() ) {
            select$($next);
            return;
        }
    }
    select$($('.batch:first'));
}

function selectPreviousBatch() {
    var $batch = $selectedBatch();
    if ( $batch.exists() ) {
        var $previous = $batch.prev();
        if ( $previous.exists() ) {
            select$($previous);
            return;
        }
    }
    select$($('.batch:last'));
}

function goToBatch() {
    var $batch = $selectedBatch();
    if ( !$batch.exists() ) {
        return;
    }
    var $link = $batch.find('a:first');
    window.location = $link.attr('href');
}

$(function() {
    keyMappings.j = selectNextBatch;
    keyMappings.k = selectPreviousBatch;
    keyCodeMappings[KEY_ENTER] = goToBatch;
});
