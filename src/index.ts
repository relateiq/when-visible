///<reference path="../typings/index.d.ts" />
let listenerIdCount = 0;
let listenerMap: { [key: number]: InDomListener } = {};
let visibilityListeners: { [key: number]: WhenListener } = {};
let animationFrameId;
let gotAnyNonTextMutation;
class WhenListener {
    id: number;
    elem: Node;
    callbacks: Function[] = [];
    everChecked: boolean = false;
    constructor(elem, cb) {
        this.id = ++listenerIdCount;
        this.elem = elem;
        this.callbacks.push(cb);
    }

    public callCallbacks() {
        this.callbacks.forEach(function(cb) {
            cb();
        });
    }
}

class InDomListener extends WhenListener {

    constructor(elem, cb) {
        super(elem, cb);
        let self = this;
        elem['__ElemInDomListenerId'] = this.id;
    }

}

function makeInDomListener(elem, cb) {
    var previousListenerId = elem['__ElemInDomListenerId'];
    if (previousListenerId) {
        var listener = listenerMap[previousListenerId];
        listener.callbacks.push(cb);
        return listener;
    }
    var listener = new InDomListener(elem, cb);
    listenerMap[listener.id] = listener;
    return listener;
}

function makeVisibilityListener(elem, cb) {
    var previousListenerId = elem['__VisibilityListenerId'];
    if (previousListenerId) {
        var listener = visibilityListeners[previousListenerId];
        listener.callbacks.push(cb);
        return listener;
    }
    var listener = new WhenListener(elem, cb);
    elem['__VisibilityListenerId'] = listener.id;
    visibilityListeners[listener.id] = listener;
    return listener;
}

function destroyInDomListener(listener) {
    if (!listener) {
        return;
    }
    delete listenerMap[listener.id];
    listener.elem['__ElemInDomListenerId'] = null;
}

function destroyVisibilityListener(listener) {
    if (!listener) {
        return;
    }
    delete visibilityListeners[listener.id];
    listener.elem['__VisibilityListenerId'] = null;
}



function getHighestParent(elem) {
    let parent = elem.parentNode;
    while (parent) {
        elem = parent;
        parent = elem.parentNode
    }
    return elem;
}

function isInDom(elem) {
    return getHighestParent(elem) === document;
}

function isVisible(element) {
    return element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0;
}

const componentObserver = new MutationObserver(function whenListenerMutationHandler(mutations: MutationRecord[]) {
    let gotNonTextAddition = false;
    let gotAnyNonText = false;
    mutations.some(function inDomListenerHandlePossibleAdd(mutation) {
        if (mutation.addedNodes.length && !gotNonTextAddition) {
            gotNonTextAddition = Array.prototype.slice.call(mutation.addedNodes)
                .some(function inDomListenerHandleAddedNode(addedNode) {
                    return addedNode.nodeType !== 3;
                });
            gotAnyNonText = gotAnyNonText || gotNonTextAddition;
        }
        if (mutation.removedNodes.length && !gotAnyNonText) {
            gotAnyNonText = Array.prototype.slice.call(mutation.removedNodes)
                .some(function inDomListenerHandleAddedNode(removedNode) {
                    return removedNode.nodeType !== 3;
                });
        }
        if (mutation.type === 'attributes') {
            gotAnyNonText = true;
        }
        if (gotAnyNonText && gotNonTextAddition) {
            return true;
        }
    });
    if (gotNonTextAddition) {
        Object.keys(listenerMap).forEach(function checkForWhenInDomListenerId(id) {
            let listener = listenerMap[id];
            // have to check if listener is defined because one listener's callback
            // can actually unbind other listeners resulting in a null map ref
            if (listener && isInDom(listener.elem)) {
                listener.callCallbacks();
                destroyInDomListener(listener);
            }
        });
    }
    gotAnyNonTextMutation = gotAnyNonText;
});

setInterval(checkVisibility, 32);

function checkVisibility() {
    animationFrameId = null;
    // for any mutation we should check waiting visibility listeners
    var keys = Object.keys(visibilityListeners);
    keys.forEach(function checkVisibiltyForWhenListenerId(id) {
        let listener = visibilityListeners[id];
        if (gotAnyNonTextMutation || (listener && !listener.everChecked)) {
            // have to check if listener is defined because one listener's callback
            // can actually unbind other listeners resulting in a null map ref

            if (listener) {
                listener.everChecked = true;
                if (isVisible(listener.elem)) {
                    listener.callCallbacks();
                    destroyVisibilityListener(listener);
                }
            }
        }
    });
    gotAnyNonTextMutation = false;
}

componentObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true
});

function whenInDom(elem, cb) {
    let listener;
    function unbind() {
        if (listener) {
            destroyInDomListener(listener);
        }
    }

    if (isInDom(elem)) {
        cb();
        return unbind;
    }
    listener = makeInDomListener(elem, cb);
    return unbind;
}

function whenVisible(elem, cb) {
    let listener;
    function unbind() {
        if (unbindInDom) {
            unbindInDom();
        }
        destroyVisibilityListener(listener);
    }

    let unbindInDom = whenInDom(elem, function() {
        listener = makeVisibilityListener(elem, cb);
    });
    return unbind;
}

module.exports = { visible: whenVisible, inDom: whenInDom }
