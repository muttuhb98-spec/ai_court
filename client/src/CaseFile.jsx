import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, ChevronLeft, Pin, X } from 'lucide-react';
import { request } from './api';

const tabs = [['all', 'All evidence'], ['chat', 'Chats'], ['image', 'Images'], ['footage', 'Footage'], ['document', 'Documents'], ['pinned', 'Pinned']];
const icon = { chat: '▤', image: '▧', footage: '▣', document: '▤' };

export default function CaseFile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const [selectedSuspect, setSelectedSuspect] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [hint, setHint] = useState(null);
  const [showAccuse, setShowAccuse] = useState(false);
  const [suspectId, setSuspectId] = useState('');
  const [reasoning, setReasoning] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [notes, setNotes] = useState(() => localStorage.getItem(`aicourt:notes:${id}`) || '');
  const [pins, setPins] = useState(() => { try { return JSON.parse(localStorage.getItem(`aicourt:pins:${id}`) || '[]'); } catch { return []; } });

  async function refresh() {
    try {
      const value = await request(`/cases/${id}`);
      setData(value);
      if (value.status === 'solved' && !location.search.includes('review=1')) navigate(`/cases/${id}/verdict`);
    } catch (e) {
      if (e.message.toLowerCase().includes('prepared')) navigate(`/cases/${id}/generating`);
      else setError(e.message);
    }
  }
  useEffect(() => { refresh(); }, [id]);
  if (error) return <main className="form-page"><div className="form-card"><h1>Case file unavailable.</h1><p>{error}</p><Link to="/cases" className="button button-primary">Back to my cases</Link></div></main>;
  if (!data) return <main className="loading">Opening the file…</main>;

  const evidence = data.evidence || [];
  const visible = evidence.filter(item => (tab === 'all' || item.type === tab || (tab === 'pinned' && pins.includes(item.id))) && (!selectedSuspect || item.relatedSuspectIds?.includes(selectedSuspect)));
  const active = visible.find(item => item.id === activeId) || visible[0];
  const togglePin = itemId => {
    const next = pins.includes(itemId) ? pins.filter(value => value !== itemId) : [...pins, itemId];
    setPins(next); localStorage.setItem(`aicourt:pins:${id}`, JSON.stringify(next));
  };
  async function requestHint() {
    try { setHint(await request(`/cases/${id}/hint`, { method: 'POST' })); }
    catch (e) { setError(e.message); }
  }
  async function accuse() {
    try {
      await request(`/cases/${id}/accuse`, { method: 'POST', body: JSON.stringify({ suspectId, reasoning }) });
      navigate(`/cases/${id}/verdict`);
    } catch (e) { setError(e.message); setShowAccuse(false); }
  }

  return <main className="case-page">
    <div className="case-heading"><Link to="/cases" className="back-link"><ChevronLeft size={14}/> ALL CASES</Link>
      <div className="case-heading-row"><div><span className="eyebrow">CASE FILE <span className="eyebrow-rule"/> {id.slice(-6).toUpperCase()}</span><h1>{data.title}</h1></div>
        <div className="case-actions"><span className="difficulty">{data.difficulty}</span><button className="button button-quiet" onClick={requestHint}>Hint ({data.hintsAvailable - data.hintsUsed} left)</button><button className="button button-primary" onClick={() => setShowAccuse(true)}>Make an accusation <ArrowRight size={15}/></button></div>
      </div>
    </div>
    <section className="briefing"><div><span className="label">THE INCIDENT</span><p>{data.briefing.incidentSummary}</p></div><div><span className="label">LOCATION</span><p>{data.briefing.location}</p></div><div><span className="label">TIME WINDOW</span><p>{data.briefing.timeWindow.start} — {data.briefing.timeWindow.end}</p></div></section>
    <section className="suspects-section"><div className="section-heading"><h2>Persons of interest</h2><button className="text-button" onClick={() => setSelectedSuspect(null)}>{selectedSuspect ? 'Clear filter' : ''}</button></div><div className="suspect-grid">{data.suspects.map(person => <button key={person.id} className={`suspect-card ${selectedSuspect === person.id ? 'selected' : ''}`} onClick={() => setSelectedSuspect(selectedSuspect === person.id ? null : person.id)}><span className="suspect-avatar">{person.name.split(' ').map(part => part[0]).join('')}</span><span className="suspect-info"><b>{person.name}</b><small>{person.role}</small><small>{person.relationToIncident}</small></span></button>)}</div></section>
    <section className="board"><div className="board-top"><div><span className="label">THE EVIDENCE ROOM</span><h2>What the record shows</h2></div><span className="evidence-count">{evidence.length} ITEMS</span></div>
      <div className="tabs">{tabs.map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => { setTab(value); setActiveId(null); }}>{label}</button>)}</div>
      <div className="evidence-layout"><aside className="evidence-list">{visible.map(item => <div className={`evidence-row ${active?.id === item.id ? 'active' : ''}`} key={item.id} role="button" tabIndex="0" onClick={() => setActiveId(item.id)} onKeyDown={event => { if (event.key === 'Enter') setActiveId(item.id); }}><span className="evidence-row-icon">{icon[item.type]}</span><span><b>{item.title}</b><small>{item.source} · {item.type}</small></span><button className="pin-button" aria-label="Pin evidence" onClick={event => { event.stopPropagation(); togglePin(item.id); }}>{pins.includes(item.id) ? '★' : '☆'}</button></div>)}</aside>
        <div className="evidence-content">{active ? <><div className="evidence-meta"><span className="evidence-kind">{icon[active.type]} {active.type}</span><span>{active.timestamp}</span></div><h2>{active.title}</h2><p className="evidence-description">{active.description}</p>
          {active.type === 'chat' && <div className="chat-box"><div className="chat-header"><span className="chat-avatar">{active.payload.participants[0].name[0]}</span><div><b>{active.payload.participants.map(person => person.name).join(' · ')}</b><small>case correspondence</small></div></div>{active.payload.messages.map(message => <div className={`message ${message.senderId === active.payload.participants[0].id ? 'left' : 'right'}`} key={message.id}><span>{message.text}</span><small>{message.time}</small></div>)}</div>}
          {active.type === 'image' && <div className="photo-placeholder"><div className="photo-art"><span>{active.payload.caption}</span></div><p>{active.payload.altText}</p></div>}
          {active.type === 'footage' && <div><div className="cctv"><div className="cctv-noise"/><span>{active.payload.cameraName} · {active.payload.frames[0]?.timestampLabel}</span><div className="cctv-silhouette">●</div><small>{active.payload.frames[0]?.caption}</small></div><p className="evidence-description">{active.payload.frames.map(frame => `${frame.timestampLabel}: ${frame.caption}`).join(' · ')}</p></div>}
          {active.type === 'document' && <article className="document"><span className="label">{active.payload.docKind}</span><pre>{active.payload.content}</pre></article>}
          <button className="text-button pin-large" onClick={() => togglePin(active.id)}><Pin size={13}/>{pins.includes(active.id) ? 'Pinned' : 'Pin this evidence'}</button></> : <div className="empty-evidence">No evidence matches these filters.</div>}</div>
      </div>
    </section>
    <section className="notes-panel"><div><span className="label">PRIVATE FIELD NOTES</span><h2>Keep your own counsel.</h2></div><textarea rows="4" value={notes} placeholder="Connections, contradictions, things to revisit…" onChange={event => { setNotes(event.target.value); localStorage.setItem(`aicourt:notes:${id}`, event.target.value); }}/></section>
    {hint && <div className="hint-box"><span className="label">HINT {hint.level} · {hint.hintsRemaining} REMAINING</span><p>{hint.text}</p><button className="text-button" onClick={() => setHint(null)}>Dismiss</button></div>}
    {showAccuse && <div className="modal-backdrop"><div className="modal"><button className="modal-close" aria-label="Close" onClick={() => setShowAccuse(false)}><X/></button><span className="eyebrow">THE MOMENT OF TRUTH</span><h2>Who took the trophy?</h2><p>This accusation is final. The full case solution will be revealed.</p>{data.suspects.map(person => <label className="radio-card" key={person.id}><input type="radio" name="suspect" value={person.id} checked={suspectId === person.id} onChange={() => setSuspectId(person.id)}/><b>{person.name}</b><small>{person.role}</small></label>)}<label className="label reasoning-label">YOUR REASONING <span>OPTIONAL</span></label><textarea maxLength="500" rows="3" value={reasoning} onChange={event => setReasoning(event.target.value)} placeholder="Which clues changed your mind?"/><label className="confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/> I understand this is final</label><button className="button button-primary full" disabled={!suspectId || !confirmed} onClick={accuse}>Deliver verdict <ArrowRight size={15}/></button></div></div>}
  </main>;
}
