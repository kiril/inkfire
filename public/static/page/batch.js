
function batchId() {
    return $('#batchId').text();
}

function tagPrediction(imageId, tag, onComplete) {
    PUT('/batch/'+batchId()+'/predictions/'+imageId+'/tags/'+tag,
        {},
        onComplete);
}

function unTagPrediction(imageId, tag, onComplete) {
    DELETE('/batch/'+batchId()+'/predictions/'+imageId+'/tags/'+tag,
           onComplete);
}

function deletePrediction(imageId, onComplete) {
    DELETE('/batch/'+batchId()+'/predictions/'+imageId, onComplete);
}

function customAddTag(imageId, tag, onComplete) {
    tagPrediction(imageId, tag, onComplete);
}

function customRemoveTag(imageId, tag, onComplete) {
    unTagPrediction(imageId, tag, onComplete);
}

function customDeleteItem(idx, imageId, callback) {
    deletePrediction(imageId, callback);
}

function showBacktest() {
    deselect();
    $('.reviewable').hide();
    $('.backtest').show();
    $('#prediction-switch').text('Predictions').data('on', 'Backtests');
    $('#prediction-type').text('Backtests');
}

function showPredictions() {
    deselect();
    $('.reviewable').hide();
    $('.prediction').show();
    $('#prediction-switch').text('Backtests').data('on', 'Predictions');
    $('#prediction-type').text('Predictions');
}

function togglePredictions() {
    event.preventDefault();
    if ( $('#prediction-switch').data('on') == 'Predictions' ) {
        showBacktest();
    } else {
        showPredictions();
    }
    return false;
}

$(function() {
    $('#prediction-switch').click(togglePredictions);
    goRoutes.p = showPredictions;
    goRoutes.b = showBacktest;
});
