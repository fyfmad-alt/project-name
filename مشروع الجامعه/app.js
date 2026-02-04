const KEY="PL_DATA_V1";
const $=s=>document.querySelector(s);
const fmt=n=>(Math.round((n+Number.EPSILON)*100)/100).toLocaleString("ar-SA");
const uid=()=>Math.random().toString(16).slice(2)+Date.now().toString(16);
const load=()=>JSON.parse(localStorage.getItem(KEY)||'{"projects":[]}');
const save=d=>localStorage.setItem(KEY,JSON.stringify(d));

const sum=tx=>{
  let inc=0,exp=0;
  tx.forEach(t=>t.kind==="income"?inc+=t.amount:exp+=t.amount);
  const net=inc-exp, margin=inc? net/inc*100:0;
  return {inc,exp,net,margin,count:tx.length};
};

const iso=d=>new Date(d).toISOString().slice(0,10);
const keyDay=d=>iso(d);
const keyMonth=d=>{d=new Date(d);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;}
const keyYear=d=>String(new Date(d).getFullYear());

const weekKey=d=>{
  d=new Date(d);
  const dt=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  const day=dt.getUTCDay()||7; dt.setUTCDate(dt.getUTCDate()+4-day);
  const yStart=new Date(Date.UTC(dt.getUTCFullYear(),0,1));
  const week=Math.ceil((((dt-yStart)/86400000)+1)/7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2,"0")}`;
};

function group(tx, by){
  const m=new Map();
  tx.forEach(t=>{
    const k = by==="day"? keyDay(t.date)
            : by==="week"? weekKey(t.date)
            : by==="month"? keyMonth(t.date)
            : keyYear(t.date);
    m.set(k,(m.get(k)||[]).concat(t));
  });
  return [...m.entries()].sort((a,b)=>a[0]<b[0]? -1:1);
}

function bestWorstPeriod(tx, by){
  const g=group(tx,by).map(([k,v])=>({k,...sum(v)}));
  if(!g.length) return null;
  const best=[...g].sort((a,b)=>b.net-a.net)[0];
  const worst=[...g].sort((a,b)=>a.net-b.net)[0];
  return {best,worst};
}

function filterBy(tx, type, ref){
  ref=new Date(ref);
  return tx.filter(t=>{
    const d=new Date(t.date);
    if(type==="day") return iso(d)===iso(ref);
    if(type==="week") return weekKey(d)===weekKey(ref);
    if(type==="month") return d.getFullYear()===ref.getFullYear() && d.getMonth()===ref.getMonth();
    if(type==="year") return d.getFullYear()===ref.getFullYear();
    return true;
  });
}

// ========= Routing =========
const page=(location.pathname.split("/").pop()||"index.html");
page==="index.html"||page==="" ? initIndex() : initProject();

// ========= Index =========
function initIndex(){
  const data=load();
  const list=$("#projectsList"), box=$("#summaryBox");

  const render=()=>{
    list.innerHTML="";
    if(!data.projects.length){
      list.innerHTML=`<p class="muted">ما فيه مشاريع. اضغط “إضافة مشروع”.</p>`;
      box.innerHTML=`<p class="muted">اختر مشروع لعرض الملخص.</p>`;
      return;
    }
    data.projects.forEach(p=>{
      const t=sum(p.transactions);
      const el=document.createElement("div");
      el.className="item";
      el.innerHTML=`
        <div>
          <div><b>${p.name}</b> <span class="badge">${p.type}</span></div>
          <div class="muted small">صافي: ${fmt(t.net)} • هامش: ${fmt(t.margin)}% • عمليات: ${t.count}</div>
        </div>
        <div class="row" style="margin:0">
          <button class="btn ghost" data-open="${p.id}">فتح</button>
          <button class="btn ghost" data-sum="${p.id}">ملخص</button>
        </div>`;
      list.appendChild(el);
    });

    list.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{
      location.href=`project.html?id=${encodeURIComponent(b.dataset.open)}`;
    });

    list.querySelectorAll("[data-sum]").forEach(b=>b.onclick=()=>{
      const p=data.projects.find(x=>x.id===b.dataset.sum);
      const t=sum(p.transactions);
      box.innerHTML=statsHTML([
        ["إجمالي الدخل", fmt(t.inc)],
        ["إجمالي المصروف", fmt(t.exp)],
        ["صافي الربح", fmt(t.net)],
        ["هامش الربح", `${fmt(t.margin)}%`]
      ]);
    });
  };

  // modal
  const modal=$("#modal");
  $("#btnAddProject").onclick=()=>{ modal.classList.remove("hidden"); $("#msg").textContent=""; $("#pName").value=""; };
  $("#btnClose").onclick=()=>modal.classList.add("hidden");
  modal.onclick=e=>{ if(e.target===modal) modal.classList.add("hidden"); };

  $("#btnSaveProject").onclick=()=>{
    const name=$("#pName").value.trim();
    const type=$("#pType").value;
    if(!name){ $("#msg").textContent="اكتب اسم المشروع."; return; }
    data.projects.push({id:uid(), name, type, createdAt:new Date().toISOString(), transactions:[]});
    save(data); modal.classList.add("hidden"); render();
  };

  render();
}

// ========= Project =========
function initProject(){
  const data=load();
  const id=new URLSearchParams(location.search).get("id");
  const p=data.projects.find(x=>x.id===id);

  if(!p){
    document.body.innerHTML=`<div class="container"><div class="card"><h2>المشروع غير موجود</h2><a class="link" href="index.html">رجوع</a></div></div>`;
    return;
  }

  $("#projectTitle").textContent=p.name;
  $("#projectMeta").textContent=`${p.type} • عمليات: ${p.transactions.length}`;
  const today=new Date();
  $("#tDate").value=iso(today);
  $("#rangeDate").value=iso(today);

  const renderAll=()=>{
    $("#projectMeta").textContent=`${p.type} • عمليات: ${p.transactions.length}`;
    renderTable();
    renderStats();
  };

  $("#btnAddTx").onclick=()=>{
    const kind=$("#tKind").value;
    const amount=Number($("#tAmount").value);
    const date=$("#tDate").value;
    const note=$("#tNote").value.trim();
    if(!date) return $("#txMsg").textContent="اختر تاريخ.";
    if(!amount||amount<=0) return $("#txMsg").textContent="اكتب مبلغ صحيح.";
    p.transactions.push({id:uid(), kind, amount, date, note});
    save(data);
    $("#tAmount").value=""; $("#tNote").value="";
    $("#txMsg").textContent="تمت الإضافة ✅";
    renderAll();
  };

  $("#btnResetProject").onclick=()=>{
    if(!confirm("أكيد تبغى حذف كل عمليات المشروع؟")) return;
    p.transactions=[]; save(data); renderAll();
  };

  $("#rangeType").onchange=renderStats;
  $("#rangeDate").onchange=renderStats;

  $("#btnCompare").onclick=()=>{
    const a=$("#mA").value, b=$("#mB").value;
    const out=$("#compareBox");
    if(!a||!b) return out.innerHTML=`<p class="muted">اختر الشهرين.</p>`;
    const aTx=p.transactions.filter(t=>keyMonth(t.date)===a);
    const bTx=p.transactions.filter(t=>keyMonth(t.date)===b);
    const A=sum(aTx), B=sum(bTx);
    out.innerHTML=statsHTML([
      [`${a} صافي`, fmt(A.net)],
      [`${b} صافي`, fmt(B.net)],
      ["الفرق", fmt(B.net-A.net)],
      ["فرق الهامش", `${fmt(B.margin-A.margin)}%`]
    ]) + `<p class="muted small" style="margin-top:10px">A دخل: <b>${fmt(A.inc)}</b> • A مصروف: <b>${fmt(A.exp)}</b> — B دخل: <b>${fmt(B.inc)}</b> • B مصروف: <b>${fmt(B.exp)}</b></p>`;
  };

  function renderTable(){
    const tb=$("#txTable");
    tb.innerHTML="";
    [...p.transactions].sort((a,b)=>a.date<b.date?1:-1).forEach(t=>{
      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td>${t.date}</td>
        <td>${t.kind==="income"?"دخل":"مصروف"}</td>
        <td>${fmt(t.amount)}</td>
        <td>${t.note||"-"}</td>
        <td><button class="mini" data-del="${t.id}">حذف</button></td>`;
      tb.appendChild(tr);
    });
    tb.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{
      p.transactions=p.transactions.filter(x=>x.id!==b.dataset.del);
      save(data); renderAll();
    });
  }

  function renderStats(){
    const type=$("#rangeType").value;
    const date=$("#rangeDate").value;
    const box=$("#stats");
    if(!date) return box.innerHTML=`<p class="muted">اختر تاريخ.</p>`;

    const filtered=filterBy(p.transactions,type,date);
    const S=sum(filtered);

    // Advanced
    const perDay=group(p.transactions,"day").map(([k,v])=>({k,...sum(v)}));
    const topDay=[...perDay].sort((a,b)=>b.net-a.net)[0];
    const avgDaily=perDay.length ? perDay.reduce((acc,x)=>acc+x.net,0)/perDay.length : 0;
    const bwMonth=bestWorstPeriod(p.transactions,"month");

    box.innerHTML =
      statsHTML([
        ["الدخل", fmt(S.inc)],
        ["المصروف", fmt(S.exp)],
        ["صافي", fmt(S.net)],
        ["هامش الربح", `${fmt(S.margin)}%`],
        ["عدد العمليات", String(S.count)],
        ["متوسط صافي يومي", fmt(avgDaily)],
        ["أعلى يوم (صافي)", topDay ? `${fmt(topDay.net)} • ${topDay.k}` : "-"],
        ["أفضل شهر", bwMonth ? `${bwMonth.best.k} • ${fmt(bwMonth.best.net)}` : "-"],
        ["أسوأ شهر", bwMonth ? `${bwMonth.worst.k} • ${fmt(bwMonth.worst.net)}` : "-"]
      ]);
  }

  renderAll();
}

function statsHTML(items){
  return `<div class="stats">` + items.map(([k,v])=>
    `<div class="stat"><div class="muted small">${k}</div><b>${v}</b></div>`
  ).join("") + `</div>`;
}
