'use client';

import React, { useState, useEffect } from 'react';
import { BookOpen, Pin, Trash2, Plus, Search, Tag, Sparkles } from 'lucide-react';
import { MemoryNote } from '@/lib/types';

export default function MemoryPage() {
  const [notes, setNotes] = useState<MemoryNote[]>([]);
  const [summaries, setSummaries] = useState<Array<{ date: string; text: string }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newText, setNewText] = useState('');
  const [newTags, setNewTags] = useState('habit, preference');
  const [isPinned, setIsPinned] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMemory = async (q: string = '') => {
    setIsLoading(true);
    try {
      const url = q ? `/api/memory?q=${encodeURIComponent(q)}` : '/api/memory';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
        setSummaries(data.summaries || []);
      }
    } catch (err) {
      console.error('Failed to load memory:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMemory();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchMemory(searchQuery);
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;

    try {
      const tagsArray = newTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newText.trim(),
          tags: tagsArray,
          pinned: isPinned,
        }),
      });

      if (res.ok) {
        setNewText('');
        setIsPinned(false);
        await fetchMemory(searchQuery);
      }
    } catch (err) {
      console.error('Failed to add memory note:', err);
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await fetch(`/api/memory?id=${id}`, { method: 'DELETE' });
      await fetchMemory(searchQuery);
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header with Level 1 Heading */}
      <div className="glass-panel p-6 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <BookOpen className="w-6 h-6 text-rose-400" aria-hidden="true" />
            <h1 className="text-2xl font-bold font-mono tracking-wider text-rose-50 glow-text-burgundy">
              Memory & Knowledge Vault
            </h1>
          </div>
          <p className="text-xs font-mono text-rose-200">
            What Sofia Remembers &middot; Long-Term Preferences &middot; End-of-Day Recaps
          </p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex items-center space-x-2 w-full md:w-auto">
          <label htmlFor="memory-search-input" className="sr-only">
            Search memory notes
          </label>
          <div className="relative flex-1 md:w-64">
            <input
              id="memory-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memory notes..."
              className="w-full glass-input pl-9 pr-3 py-2.5 rounded-xl text-xs placeholder:text-rose-300 min-h-[44px]"
            />
            <Search className="w-4 h-4 text-rose-300 absolute left-3 top-3.5" aria-hidden="true" />
          </div>
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-500/30 text-rose-100 text-xs font-mono min-h-[44px]"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Add Memory Note Card */}
      <section aria-labelledby="add-memory-heading" className="glass-card p-6 rounded-3xl border border-rose-500/25 space-y-4">
        <div className="flex items-center space-x-2 text-rose-100 font-mono text-xs font-bold uppercase">
          <Plus className="w-4 h-4 text-rose-400" aria-hidden="true" />
          <h2 id="add-memory-heading">Teach Sofia a Fact, Goal, or Rule</h2>
        </div>

        <form onSubmit={handleAddNote} className="space-y-3">
          <label htmlFor="new-memory-text" className="sr-only">
            Memory note details
          </label>
          <textarea
            id="new-memory-text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="e.g. Prefers blunt constructive feedback; exam sprint on Nov 20; wake goal strictly 07:30..."
            className="w-full glass-input p-3.5 rounded-2xl text-xs h-20 placeholder:text-rose-300 resize-none min-h-[80px]"
            required
          />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <label htmlFor="new-memory-tags" className="text-xs font-mono text-rose-200 flex items-center space-x-1.5 shrink-0">
                <Tag className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                <span>Tags:</span>
              </label>
              <input
                id="new-memory-tags"
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="tags (comma-separated)..."
                className="glass-input px-3 py-2 rounded-xl text-xs w-full sm:w-64 min-h-[44px]"
              />
            </div>

            <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
              <label htmlFor="pin-note-checkbox" className="flex items-center space-x-2 text-xs font-mono text-rose-200 cursor-pointer select-none min-h-[44px]">
                <input
                  id="pin-note-checkbox"
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="w-4 h-4 rounded bg-rose-950 border-rose-500/40 text-rose-600 focus:ring-rose-500"
                />
                <Pin className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Pin to context</span>
              </label>

              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-700 to-crimson-600 hover:from-rose-600 hover:to-crimson-500 text-white font-mono text-xs font-bold transition-all shadow-[0_0_15px_rgba(225,29,72,0.3)] min-h-[44px]"
              >
                Save to Memory
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* End-of-Day Recaps & Retrospectives */}
      {summaries && summaries.length > 0 && (
        <section aria-labelledby="summaries-heading" className="glass-card p-6 rounded-3xl border border-rose-500/25 space-y-4">
          <div className="flex items-center space-x-2 text-rose-100 font-mono text-xs font-bold uppercase">
            <Sparkles className="w-4 h-4 text-rose-400" aria-hidden="true" />
            <h2 id="summaries-heading">Sofia End-of-Day Recaps & Retrospectives</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {summaries.map((s, idx) => (
              <div key={idx} className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/20 space-y-2">
                <span className="text-xs font-mono text-rose-300 font-bold">{s.date}</span>
                <p className="text-xs text-rose-100 font-sans leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Memory Notes Grid */}
      <section aria-labelledby="memory-notes-heading" className="space-y-3">
        <h2 id="memory-notes-heading" className="text-xs font-mono uppercase tracking-wider text-rose-200 font-semibold">
          Saved Memory Notes ({notes.length})
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4" role="list">
          {notes.map((note) => (
            <div
              key={note.id}
              role="listitem"
              className="glass-card p-5 rounded-2xl border border-rose-500/25 space-y-3 flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono text-rose-300">
                  <span className="flex items-center space-x-1">
                    {note.pinned && <Pin className="w-3 h-3 text-rose-400 fill-rose-500" aria-label="Pinned note" />}
                    <span>{new Date(note.created_at).toLocaleDateString()}</span>
                  </span>
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    aria-label={`Delete memory: ${note.text.slice(0, 30)}`}
                    className="text-rose-400 hover:text-red-400 transition-colors p-1 rounded-md min-h-[32px] min-w-[32px] flex items-center justify-center"
                    title="Delete note"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
                <p className="text-xs text-rose-50 font-sans leading-relaxed">{note.text}</p>
              </div>

              {note.tags && note.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-rose-500/15" aria-label="Tags">
                  {note.tags.map((t, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-950/70 border border-rose-500/25 text-rose-200"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {notes.length === 0 && (
            <p className="text-xs text-rose-300 italic col-span-3 text-center py-8">
              No memory notes stored. Use the form above to teach Sofia facts about your workflow.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
