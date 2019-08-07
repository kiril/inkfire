
function $itemAtIndex(idx) {
    return $('.reviewable.'+idx);
}

function $selectedItem() {
    return $('.reviewable.selected');
}

function selectedIndex() {
    return itemIndex$($selectedItem());
}

function itemIndex$($item) {
    return $item.exists() ? parseInt($item.data('index')) : -1;
}

function itemImageId$($item) {
    return $item.exists() ? $item.data('image-id') : null;
}

function selectedImageId() {
    return itemImageId$($selectedItem());
}

function haveSelection() {
    return $selectedItem().exists();
}

function selectFirstVisible() {
    var wasEditing = isEditing();
    var index = $('.reviewable:visible:first').data('index');
    selectIndex(index);
    if ( wasEditing ) {
        startEditing();
    }
}

function selectLastVisible() {
    var wasEditing = isEditing();
    var index = $('.reviewable:visible:last').data('index');
    selectIndex(index);
    if ( wasEditing ) {
        startEditing();
    }
}

function skipForward() {
    next(5);
}

function skipBackward() {
    previous(5);
}

function next(initialIncrement) {
    var $item = $selectedItem();
    if ( !$item.exists() ) {
        selectFirstVisible();
        return;
    }

    var wasEditing = isEditing();

    stopEditing();

    var index = itemIndex$($item);
    initialIncrement = initialIncrement || 1;
    var toIndex = index+initialIncrement;
    var $toItem = $('.reviewable.'+toIndex);

    while ( $toItem.exists() ) {
        if ( $toItem.is(':visible') ) {
            selectIndex(toIndex);
            if ( wasEditing ) {
                startEditing();
            }
            return;
        }
        toIndex++;
        $toItem = $('.reviewable.'+toIndex);
    }

    selectFirstVisible();
    if ( wasEditing ) {
        startEditing();
    }
}

function previous(initialIncrement) {
    var $item = $selectedItem();
    if ( !$item.exists() ) {
        selectLastVisible();
        return;
    }

    var wasEditing = isEditing();

    stopEditing();

    var index = itemIndex$($item);
    initialIncrement = initialIncrement || 1;
    var toIndex = index-initialIncrement;
    var $toItem = $('.reviewable.'+toIndex);

    while ( $toItem.exists() && toIndex > -1 ) {
        if ( $toItem.is(':visible') ) {
            selectIndex(toIndex);
            if ( wasEditing ) {
                startEditing();
            }
            return;
        }
        toIndex--;
        $toItem = $('.reviewable.'+toIndex);
    }

    selectLastVisible();
    if ( wasEditing ) {
        startEditing();
    }
}

function selectIndex(idx) {
    deselect();
    var $item = $itemAtIndex(idx);
    if ( !$item.exists() ) {
        console.log("invalid item index " + idx);
        return;
    }

    $('html,body').animate({scrollTop: $item.offset().top-200});
    $item.show().addClass('selected');
    setHashParameter('idx', idx);
    var imageId = selectedImageId();
    getImage(imageId, function(image) {
        updateItemFromImage(idx, image);
    });
}

function selectImage(imageId) {
    var $item = $('.reviewable[data-image-id="'+imageId+'"]');
    if ( $item.exists() ) {
        selectIndex(parseInt($item.data('index')));
    }
}

function startEditing() {
    startEditingIndex(selectedIndex());
}

function startEditingIndex(idx) {
    var $item = $itemAtIndex(idx);
    $item.addClass('editing').find('input').focus();
    setHashParameter('mode', 'editing');
}

function stopEditing(event) {
    if ( event ) {
        event.preventDefault();
        event.stopPropagation();
    }
    var $item = $selectedItem();
    $item.removeClass('editing').find('input').val('');
    removeHashParameter('mode');
}

function isEditing() {
    return $selectedItem().is('.editing');
}

function filterForTag(tag) {
    $('.reviewable').hide()
        .find(tagSelector(tag))
        .parent('.reviewable').show();
}

function resetFilters() {
    $('.reviewable').show();
}

function deselect() {
    var $item = $selectedItem();
    if ( !$item.exists() ) {
        return;
    }
    stopEditing();
    $item.removeClass('selected');
    $item.find('img').attr('width', '100');
    removeHashParameter('idx');
}

function $tagEndSentinal(idx) {
    var $item = idx ? $itemAtIndex(idx) : $selectedItem();
    return $item.find('.sentinal');
}

function tagSelector(tag) {
    return '.tag[data-name="'+tag+'"]';
}

function isTagged(idx, tag) {
    return $itemAtIndex(idx).find(tagSelector(tag)).exists();
}

function showTag(idx, tag, options) {
    var options = options || {};
    var check = '<i class="fal fa-check-circle text-success text-tiny ml-1"></i>';
    var templateNoScore = '<div data-name="{{tag}}" class="tag {{weightClass}} {{color}}"><span class="name">{{tag}}'+(options.correct ? check : "")+'</i></span></div>';
    var templateScore = '<div data-name="{{tag}}" class="tag {{weightClass}} {{color}}"><span class="name">{{tag}}'+(options.correct ? check : "")+'</i></span> <span class="score">{{score}}%</span></div>';

    var usingScores = $('.score').exists();

    var template = usingScores ? templateScore : templateNoScore;

    var $item = $itemAtIndex(idx);
    var $existing = $item.find(tagSelector(tag));
    if ( $existing.exists() ) {
        if ( options.correct && !$existing.find('i.fa-check-circle').exists() ) {
            $existing.removeClass('missing').find('.name').append(check);
        }
        return;
    }

    var weightClass = options.weightClass || usingScores ? 'font-weight-bold' : 'font-weight-normal';
    var color = options.color || usingScores ? 'text-danger' : 'text-dark';
    var score = options.score || '-';

    var html = simpleReplace(template, {tag: tag,
                                        weightClass: weightClass,
                                        color: color,
                                        score: score})
    $tagEndSentinal(idx).before(html);
}

function hideTag(idx, tag) {
    $itemAtIndex(idx).find(tagSelector(tag)).remove();
}

function updateItemFromImage(idx, image) {
    var $item = $itemAtIndex(idx);
    if ( image.deleted ) {
        $item.addClass('deleted');
    } else {
        $item.removeClass('deleted');
    }

    Object.keys(image.tags || {}).forEach(tag => {
        showTag(idx, tag, {correct: true});
    });
}

function existingStyles() {
    var styles = [];
    $('#existing-style option').each(function(i) {
        styles.push($(this).attr('value'));
    });
    return styles;
}

function autocompleteTag(tag) {
    var styles = existingStyles();
    styles.sort(function(a, b) {
        if ( a == tag ) { return -1; }
        if ( b == tag ) { return 1 }

        var aStarts = a.startsWith(tag);
        var bStarts = b.startsWith(tag);
        var aSorta = sortaMatches(a, tag);
        var bSorta = sortaMatches(b, tag);
        var aHas = a.indexOf(tag) != -1;
        var bHas = b.indexOf(tag) != -1;

        if ( aStarts && !bStarts ) { return -1; }
        if ( bStarts && !aStarts ) { return 1; }
        if ( aHas && !bHas ) { return -1 }
        if ( bHas && !aHas ) { return 1 }
        if ( aSorta && !bSorta ) { return -1 }
        if ( bSorta && !aSorta ) { return 1 }

        var common = commonPrefix(a, b);
        if ( a == common ) { return -1 }
        if ( b == common ) { return 1 }

        return a < b ? -1 : 1;
    });

    var best = styles[0];
    var second = styles[1];

    return sortaMatches(best, tag) || (best.indexOf(tag) > -1 && second.indexOf(tag) == -1) ? best : null;
}

function handleReviewableClick(event) {
    var $target = $(event.target);
    if ( $target.is('img') || $target.is('input') ) {
        return;
    }
    event.preventDefault();
    var $item = $target.is('.reviewable') ? $target : $target.parent('.reviewable');
    if ( $item ) {
        selectIndex($item.data('index'));
    }
}

function deleteSelected() {
    var $item = $selectedItem();
    if ( !$item.exists() ) {
        return;
    }

    var imageId = itemImageId$($item);
    var idx = itemIndex$($item);
    var finishDelete = function() {
        deleteImage(imageId, function() {
            $itemAtIndex(idx).addClass('deleted');
        });
    }

    if ( window.customDeleteItem ) {
        window.customDeleteItem(idx, imageId, finishDelete);
    } else {
        finishDelete();
    }

    next();
}

function reviewKeyDown(event) {
    var keyMappings = {j: next,
                       J: skipForward,
                       k: previous,
                       K: skipBackward};

    var keyCodeMappings = {[''+KEY_ENTER]: startEditing};

    var ctrlKeyMappings = {j: next,
                           J: skipForward,
                           k: previous,
                           K: skipBackward,
                           d: deleteSelected,
                           g: deselect,
                           ';': stopEditing};

    var ctrlKeyCodeMappings = {};

    if ( event.ctrlKey ) {
        var func = ctrlKeyMappings[event.key] || ctrlKeyCodeMappings[event.keyCode];
        if ( func ) {
            event.preventDefault();
            func();
        }
        return;
    }

    if ( !$(event.target).is('body') ) {
        return;
    }


    var func = keyMappings[event.key] || keyCodeMappings[''+event.keyCode];
    if ( func ) {
        func();
    }
}

function tagSelected(options) {
    var $item = $selectedItem();
    var $input = $item.find('input');
    var text = $input.val().trim();

    var tag = options.literal ? text : autocompleteTag(text);
    if ( !tag ) {
        alert("No tag matching '" + text + "'");
        return;
    }

    $input.val('');

    var imageId = itemImageId$($item);
    var index = selectedIndex()

    function remove() {
        unTagImage(imageId, tag, function() {
            hideTag(index, tag);
        });
    }

    function add() {
        tagImage(imageId, tag, function() {
            showTag(index, tag, {correct: true});
        });
    }

    if ( options.remove ) {
        if ( window.customRemoveTag ) {
            window.customRemoveTag(imageId, tag, remove);
        } else {
            remove();
        }

    } else {
        if ( window.customAddTag ) {
            window.customAddTag(imageId, tag, add);
        } else {
            add();
        }
    }
}

function tagKeyDown(event) {
    var ctrlKeyMappings = {};

    if ( event.ctrlKey ) {
        var func = ctrlKeyMappings[event.key];
        if ( func ) {
            event.preventDefault();
            func();
            return;
        }
    }

    if ( event.keyCode == KEY_ENTER ) {
        event.preventDefault();
        var options = {};
        options.literal = event.ctrlKey;
        options.remove = event.shiftKey;
        tagSelected(options);
        return;
    }

    if ( event.keyCode == KEY_TAB ) {
        event.preventDefault();
        var $input = $selectedItem().find('input');
        var text = $input.val().trim();
        var auto = autocompleteTag(text);
        if ( auto ) {
            $input.val(auto);
        } else {
            alert("Couldn't auto-complete '" + text + "'");
        }
        return;
    }
}

$(function() {
    $(window).keydown(reviewKeyDown);
    $('.reviewable').click(handleReviewableClick);
    $('.tagger input').keydown(tagKeyDown);

    var idx = hashParameter('idx');
    var mode = hashParameter('mode');
    if ( idx ) {
        selectIndex(idx);
        if ( mode == 'editing' ) {
            startEditing();
        }
    }

    goRoutes['0'] = function() { selectFirstVisible(); }
});
