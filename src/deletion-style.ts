/** Keep deletion styling intact when an editor theme supplies more-specific
 * text colors or decoration rules. Call only on plugin-owned deleted text. */
export function styleDeletion(element:HTMLElement,red:boolean){
  element.classList.toggle('tc-deletion-red',red);
  if(!red)return;
  element.style.setProperty('color','var(--color-red)','important');
  element.style.setProperty('text-decoration-line','line-through','important');
  element.style.setProperty('text-decoration-color','var(--color-red)','important');
}
