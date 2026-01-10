const BasePalette = [
  { id:"white",       name:"wit",        hex:"#FFFFFF" },
  { id:"black",       name:"zwart",      hex:"#000000" },
  { id:"pink",        name:"roze",       hex:"#FF69B4" },
  { id:"red",         name:"rood",       hex:"#E53935" },
  { id:"orange",      name:"oranje",     hex:"#FB8C00" },
  { id:"yellow",      name:"geel",       hex:"#FDD835" },
  { id:"green",       name:"groen",      hex:"#43A047" },
  { id:"lightblue",   name:"lichtblauw", hex:"#29B6F6" },
  { id:"indigo",      name:"indigo",     hex:"#3949AB" },
  { id:"lightpurple", name:"lichtpaars", hex:"#BA68C8" },
  { id:"violet",      name:"violet",     hex:"#8E24AA" }
];

function normalizeHex(hex){
  if(!hex) return "#000000";
  const h = hex.trim();
  if(/^#[0-9a-fA-F]{6}$/.test(h)) return h.toUpperCase();
  return "#000000";
}
