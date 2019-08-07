
function updateStatus(status) {
    $('#status').text(status);
    if ( status == 'deleted' ) {
        $('#status').removeClass('text-info').addClass('text-danger');
    } else if ( status == 'active' ) {
        $('#status').removeClass('text-danger').addClass('text-info');
    }
}


function handleRename(event) {
    var $button = $('#rename');
    var $input = $('#new-name');
    var newName = $input.val().trim();
    var oldName = $button.data('style');
    var data = {name: newName};
    $.ajax({
        type: "POST",
        contentType: "application/json; charset=utf-8",
        url: '/style/' + oldName,
        data: JSON.stringify(data),
        dataType: "json",
        success: function(data) {
            window.location = '/style/' + newName;
        }
    });
}

function handleCotag(event) {
    var $button = $('#cotag');
    var $input = $('#co-tag');
    var addTag = $input.val().trim();
    var style = $button.data('style');
    var data = {add: addTag};
    $.ajax({
        type: "POST",
        contentType: "application/json; charset=utf-8",
        url: '/style/' + style,
        data: JSON.stringify(data),
        dataType: "json"
    });
}


function handleDelete(event) {
    var $button = $(event.target);
    var style = $button.data('style');
    if ( confirm('Delete '+style+'?') ) {
        $.ajax({
            type: "DELETE",
            url: '/style/' + style,
            success: function() {
                updateStatus('deleted');
            }
        });
    }
}


$(function() {
    $('#rename').click(handleRename);
    $('#cotag').click(handleCotag);
    $('#delete').click(handleDelete);
});
