const API_BASE = (window.FILEFLOW_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const tools = {
  "image-compress": {title:"Compress image", kicker:"IMAGE TOOL", desc:"Reduce file size while keeping your image looking good.", accepted:"JPG, PNG or WebP · processed in your browser", accept:"image/jpeg,image/png,image/webp", button:"Compress image", mode:"image", options:true},
  "pdf-jpg": {title:"PDF to JPG", kicker:"PDF TOOL", desc:"Turn each page of a PDF into a high-quality JPG image.", accepted:"PDF files · processed by your local backend", accept:"application/pdf,.pdf", button:"Convert to JPG", mode:"server-pdf", options:false},
  "jpg-pdf": {title:"JPG to PDF", kicker:"PDF TOOL", desc:"Package an image into a shareable PDF document.", accepted:"JPG or PNG · processed in your browser", accept:"image/jpeg,image/png", button:"Convert to PDF", mode:"jpg-pdf", options:false},
  "ppt-pdf": {title:"PPT to PDF", kicker:"DOCUMENT TOOL", desc:"Convert a PowerPoint presentation into a PDF.", accepted:"PPT or PPTX · requires LibreOffice on backend", accept:".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation", button:"Convert to PDF", mode:"server-ppt", options:false}
};
let currentTool = "image-compress", selectedFile = null;
const $ = id => document.getElementById(id);
const fileInput=$("fileInput"), dropzone=$("dropzone"), result=$("result"), runBtn=$("runBtn");
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
function setTool(key){
  currentTool=key; const t=tools[key]; selectedFile=null; fileInput.value=""; result.hidden=true;
  document.querySelectorAll(".tool-card").forEach(b=>b.classList.toggle("selected",b.dataset.tool===key));
  $("toolTitle").textContent=t.title; $("toolKicker").textContent=t.kicker; $("toolDescription").textContent=t.desc;
  $("acceptedText").textContent=t.accepted; $("runBtn").innerHTML=t.button+' <span>→</span>'; fileInput.accept=t.accept;
  $("options").hidden=!t.options; $("selectedFile").hidden=true; runBtn.disabled=true; $("statusText").textContent="Ready when you are.";
}
document.querySelectorAll(".tool-card").forEach(b=>b.addEventListener("click",()=>setTool(b.dataset.tool)));
$("chooseBtn").addEventListener("click",()=>fileInput.click());
fileInput.addEventListener("change",()=>{if(fileInput.files[0]) chooseFile(fileInput.files[0]);});
function chooseFile(file){
  selectedFile=file; $("selectedFile").hidden=false;
  $("selectedFile").textContent=`${file.name} · ${formatBytes(file.size)}`;
  runBtn.disabled=false; $("statusText").textContent="File ready to process."; result.hidden=true;
}
function formatBytes(n){if(n<1024)return n+" B";if(n<1024*1024)return (n/1024).toFixed(1)+" KB";return (n/1024/1024).toFixed(2)+" MB";}
["dragenter","dragover"].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.add("dragover");}));
["dragleave","drop"].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.remove("dragover");}));
dropzone.addEventListener("drop",e=>{const f=e.dataTransfer.files[0];if(f)chooseFile(f);});
$("quality").addEventListener("input",e=>$("qualityValue").textContent=e.target.value+"%");
$("themeBtn").addEventListener("click",()=>document.body.classList.toggle("dark"));
runBtn.addEventListener("click",async()=>{
  if(!selectedFile)return; runBtn.disabled=true; result.hidden=true; $("statusText").textContent="Working…";
  try {
    if(currentTool==="image-compress") await compressImage(selectedFile);
    else if(currentTool==="jpg-pdf") await imageToPdf(selectedFile);
    else if(currentTool==="pdf-jpg") await serverConvert(selectedFile,"pdf-to-jpg");
    else if(currentTool==="ppt-pdf") await serverConvert(selectedFile,"ppt-to-pdf");
  } catch(err){ showError(err.message||"Something went wrong. Please try again."); }
  finally{runBtn.disabled=false;}
});
function showError(message){result.hidden=false;result.innerHTML=`<strong>Could not process file</strong><p>${escapeHtml(message)}</p>`;$("statusText").textContent="Please check the file and try again.";}
function showDownload(blob,name,details){
  const url=URL.createObjectURL(blob); result.hidden=false;
  result.innerHTML=`<strong>✓ Your file is ready</strong><p>${escapeHtml(details||name)}</p><a href="${url}" download="${escapeHtml(name)}">Download ${escapeHtml(name)} ↓</a>`;
  $("statusText").textContent="Finished successfully.";
}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function compressImage(file){
  if(!file.type.startsWith("image/"))throw new Error("Choose a valid image file.");
  const bitmap=await createImageBitmap(file); const canvas=document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;
  canvas.getContext("2d").drawImage(bitmap,0,0);bitmap.close();
  const quality=Number($("quality").value)/100;
  // JPEG output is broadly supported; PNG transparency is not preserved in JPEG.
  const type=file.type==="image/png"?"image/webp":"image/jpeg";
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Your browser could not encode this image.")),type,quality));
  const ext=type==="image/webp"?"webp":"jpg", name=file.name.replace(/\.[^.]+$/,"")+"-compressed."+ext;
  const saved=Math.max(0,Math.round((1-blob.size/file.size)*100));
  showDownload(blob,name,`${formatBytes(file.size)} → ${formatBytes(blob.size)} · ${saved}% smaller · ${canvas.width} × ${canvas.height}px`);
}
async function imageToPdf(file){
  if(!window.jspdf)await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error("Could not read image."));r.readAsDataURL(file);});
  const img=await createImageBitmap(file);const {jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:img.width>img.height?"landscape":"portrait",unit:"px",format:[img.width,img.height]});
  pdf.addImage(dataUrl,file.type==="image/png"?"PNG":"JPEG",0,0,img.width,img.height);img.close();
  const blob=pdf.output("blob");showDownload(blob,file.name.replace(/\.[^.]+$/,"")+".pdf",`Created PDF from ${file.name} · ${formatBytes(blob.size)}`);
}
async function serverConvert(file,endpoint){
  const form=new FormData();form.append("file",file);
  const response=await fetch(`${API_BASE}/api/${endpoint}`,{method:"POST",body:form});
  if(!response.ok){let message="Backend conversion failed.";try{message=(await response.json()).detail||message;}catch{}throw new Error(message+" Make sure the FileFlow backend is running.");}
  const blob=await response.blob();
  if(endpoint==="pdf-to-jpg" && blob.type==="application/zip")showDownload(blob,file.name.replace(/\.pdf$/i,"")+"-jpg-pages.zip",`Converted pages from ${file.name} · ${formatBytes(blob.size)}`);
  else showDownload(blob,file.name.replace(/\.[^.]+$/i,"")+".pdf",`Converted ${file.name} · ${formatBytes(blob.size)}`);
}
function loadScript(src){return new Promise((resolve,reject)=>{const s=document.createElement("script");s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error("Could not load the PDF library. Check your internet connection."));document.head.appendChild(s);});}
setTool(currentTool);