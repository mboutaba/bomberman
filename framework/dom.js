
// Create a virtual DOM structure: => represent elements as objects {type, props, children}
export const createElement = (tag, props, ...children) => {
return {
    tag,
    props: props,
    children: children.flat()
}
}

// const buttonElement = createElement(
//   'button',
//   { id: 'my-btn', className: 'btn-primary', onClick: () => alert('Clicked!') },
//   'Click me'
// );

// implement the renderer function: => converts the vDOM object into a real DOM node:
export const render = (vnode) => {
  if (vnode === null || vnode === undefined || typeof vnode === 'boolean') {
    return document.createTextNode('');
  }

  if (typeof vnode === 'string' || typeof vnode === 'number') {
    return document.createTextNode(vnode.toString());
  }

  const { tag, props, children } = vnode;

  const element = document.createElement(tag);

  applyEventHandlers(element, props);

  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith('on')) {
      continue; 
    }

    if (key === 'ref') {
      if (typeof value === 'function') {
        value(element);
      }
    } else if (key === 'checked' || key === 'value' || key === 'disabled' || key === 'autofocus') {
      element[key] = value;
    } else {
      element.setAttribute(key, value);
    }
  }

  for (const child of children) {
    element.appendChild(render(child));
  }

  return element;
};

// Implement diff function: => compares old  and new vDOM trees, updates only the changes nodes in the real DOM:
// patch = primary diffing function.

// Handles text nodes, element type changes, props changes.

function patch(parentEl, oldVNode, newVNode, index = 0) {
    const el = parentEl.childNodes[index];

    if (!el) {
        parentEl.appendChild(render(newVNode));
        return;
    }

    const oldV = (oldVNode == null || typeof oldVNode === 'boolean') ? '' : oldVNode;
    const newV = (newVNode == null || typeof newVNode === 'boolean') ? '' : newVNode;

    const oldIsPrimitive = typeof oldV !== 'object';
    const newIsPrimitive = typeof newV !== 'object';

    if (oldIsPrimitive || newIsPrimitive) {
        if (String(oldV) !== String(newV)) {
            el.replaceWith(render(newV));
        }
        return;
    }

    if (oldV.tag !== newV.tag) {
        el.replaceWith(render(newV));
        return;
    }

    patchProps(el, oldV.props, newV.props);
    patchChildren(el, oldV.children, newV.children);
}

// patchChildren = recursively diffs child arrays.
function patchChildren(parentEl, oldChildren, newChildren) {
    const oldLen = oldChildren.length;
    const newLen = newChildren.length;
    const commonLen = Math.min(oldLen, newLen);

    for (let i = 0; i < commonLen; i++) {
        patch(parentEl, oldChildren[i], newChildren[i], i);
    }

    if (oldLen > newLen) {
        for (let i = oldLen - 1; i >= newLen; i--) {
            parentEl.childNodes[i].remove();
        }
    }
    else if (newLen > oldLen) {
        for (let i = oldLen; i < newLen; i++) {
            parentEl.appendChild(render(newChildren[i]));
        }
    }
}

// patchProps = diffs and updates only changed attributes/properties.

export const mount = (node, target) => {
  target.innerHTML = '';
  target.appendChild(node);
  return node;
};


function patchProps(el, oldProps, newProps) {
  if (oldProps === newProps) return;
  oldProps = oldProps || {};
  newProps = newProps || {};

  for (const key in newProps) {
    if (newProps.hasOwnProperty(key)) {
      const oldValue = oldProps[key];
      const newValue = newProps[key];
      if (newValue !== oldValue) {
        if (key.startsWith('on') && typeof newValue === 'function') {
          el[key.toLowerCase()] = newValue;
        } else if (key === 'ref' && typeof newValue === 'function') {
          newValue(el);
        } else if (key === 'checked' || key === 'value' || key === 'disabled' || key === 'autofocus') {
          el[key] = newValue;
        } else if (newValue != null) {
          el.setAttribute(key, newValue);
        }
      }
    }
  }

  for (const key in oldProps) {
    if (oldProps.hasOwnProperty(key) && !newProps.hasOwnProperty(key)) {
      if (key.startsWith('on')) {
        el[key.toLowerCase()] = null;
      } else if (key !== 'ref') {
        el.removeAttribute(key);
      }
    }
  }
}

export const createApp = (component, target) => {
    let currentVNode = component();
    let rootNode = render(currentVNode);
    mount(rootNode, target);

    return () => {
        const newVNode = component();
        patch(target, currentVNode, newVNode);
        currentVNode = newVNode;
    };
};
