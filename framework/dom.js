
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