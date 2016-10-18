///<reference path="../typings/index.d.ts" />
let listenerIdCount = 0;
let listenerMap : { [key: number]: InDomListener } = {};
let visibilityListeners : {[key: number]: WhenListener} = {};
class WhenListener{
    id: number;
    elem : Node;
    callbacks : Function[] = [];
    constructor(elem, cb){
        this.id = ++listenerIdCount;
        this.elem = elem;
        this.callbacks.push(cb);
    }

    public callCallbacks(){
        this.callbacks.forEach(function (cb) {
            cb();
        });
    }
}

class InDomListener extends WhenListener{
    highestParentObserver : MutationObserver;
    highestParent : Node;

    constructor(elem, cb){
        super(elem, cb);
        let self = this;
        this.highestParentObserver = new MutationObserver(function(mutations: MutationRecord[]) {
            mutations.some(function (mutation : MutationRecord) {
                if(mutation.removedNodes.length){
                    self.updateInDomListenerParent();
                    return true; // if we updated at all we don't need to do it again
                }
            });
        });
        self.updateInDomListenerParent();
        elem['__ElemInDomListenerId'] = this.id;
    }

    private updateInDomListenerParent() {
        let highestParent = getHighestParent(this.elem);
        if(highestParent !== this.highestParent){
            if(this.highestParent){
                this.highestParent['__InDomListenerId'] = null;
            }
            this.highestParent = highestParent;
            this.highestParent['__InDomListenerId'] = this.id;
            this.highestParentObserver.disconnect();
            this.highestParentObserver.observe(highestParent, {
                childList : true,
                subtree : true
            });
        }
    }
}

function makeInDomListener(elem, cb) {
    var previousListenerId = elem['__ElemInDomListenerId'];
    if(previousListenerId){
        var listener = listenerMap[previousListenerId];
        listener.callbacks.push(cb);
        return listener;
    }
    var listener = new InDomListener(elem, cb);
    listenerMap[listener.id] = listener;
    return listener;
}

function makeVisibilityListener(elem, cb){
    var previousListenerId = elem['__VisibilityListenerId'];
    if(previousListenerId){
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
    if(!listener){
        return;
    }
    listener.highestParentObserver.disconnect();
    delete listenerMap[listener.id];
    if(listener.highestParent){
        listener.highestParent['__InDomListenerId'] = null;
    }
    listener.elem['__ElemInDomListenerId'] = null;
}

function destroyVisibilityListener(listener) {
    if(listener){
        delete visibilityListeners[listener.id];
    }
    listener.elem['__VisibilityListenerId'] = null;
}



function getHighestParent(elem) {
    let parent = elem.parentNode;
    while(parent){
        elem = parent;
        parent = elem.parentNode
    }
    return elem;
}

function isInDom(elem) {
    return getHighestParent(elem) === document.body;
}

function isVisible(element) {
    return element.offsetWidth > 0 && element.offsetHeight > 0;
}

const componentObserver = new MutationObserver(function whenListenerMutationHandler(mutations: MutationRecord[]) {
    mutations.forEach(function inDomListenerHandlePossibleAdd(mutation) {
        if(mutation.addedNodes.length){
            Array.prototype.slice.call(mutation.addedNodes).forEach(function inDomListenerHandleAddedNode(addedNode) {
                if(addedNode.__InDomListenerId){
                    var listener = listenerMap[addedNode.__InDomListenerId];
                    listener.callCallbacks();
                    destroyInDomListener(listener);
                }
            });
        }
    });
    // for any mutation we should check waiting visibility listeners
    Object.keys(visibilityListeners).forEach(function checkVisibiltyForWhenListenerId(id) {
        let listener = visibilityListeners[id];
        if(isVisible(listener.elem)){
            listener.callCallbacks();
            destroyVisibilityListener(listener);
        }
    });
});

componentObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true
});

function whenInDom(elem, cb) {
    let listener;
    function unbind(){
        if(listener){
            destroyInDomListener(listener);
        }
    }

    if(isInDom(elem)){
        cb();
        return unbind;
    }
    listener = makeInDomListener(elem, cb);
    return unbind;
}

function whenVisible(elem, cb) {
    let listener;
    function unbind(){
        if(unbindInDom){
           unbindInDom();
        }
        destroyVisibilityListener(listener);
    }

    if(isVisible(elem)){
        cb();
        return unbind;
    }
    let unbindInDom = whenInDom(elem, function () {
         if(isVisible(elem)){
           cb();
         }
         listener = makeVisibilityListener(elem, cb);
         visibilityListeners[listener.id] = listener;
    });
    return unbind;
}

module.exports = {visible : whenVisible, inDom : whenInDom}
