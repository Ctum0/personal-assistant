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
      {/* Header */}
      <div className="glass-panel p-6 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <BookOpen className="w-6 h-6 text-rose-400" />
            <h1 className="text-2xl font-bold font-mono tracking-wider text-rose-50 glow-text-burgundy">
              Memory & Knowledge Vault
            </h1>
          </div>
          <p className="text-xs font-mono text-rose-300/70">
            What Sofia Remembers &middot; Long-Term Preferences &middot; End-of-Day Recaps
          </p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex items-center space-x-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memory notes..."
              className="w-full glass-input pl-9 pr-3 py-2 rounded-xl text-xs"
            />
            <Search className="w-4 h-4 text-rose-400/60 absolute left-3 top-2.5" />
          </div>
          <button
            type="submit"
            className="px-3.5 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 border border-rose-500/30 text-rose-200 text-xs font-mono"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Add Memory Note Card */}
      <div className="glass-card p-6 rounded-3xl border border-rose-500/20 space-y-4">
        <div className="flex items-center space-x-2 text-rose-200 font-mono text-xs font-bold uppercase">
          <Plus className="w-4 h-4 text-rose-400" />
          <span>Teach Sofia a Fact, Goal, or Rule</span>
        </div>

        <form onSubmit={handleAddNote} className="space-y-3">
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="e.g. Prefers blunt constructive feedback; exam sprint on Nov 20; wake goal strictly 07:30..."
            className="w-full glass-input p-3.5 rounded-2xl text-xs h-20 placeholder:text-rose-400/40 resize-none"
            required
          />

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <Tag className="w-3.5 h-3.5 text-rose-400/60" />
              <input
                type="text"
                value={newTags}
                onChange={(e) => setNewTags(e.target.value)}
                placeholder="tags (comma-separated)..."
                className="glass-input px-3 py-1.5 rounded-xl text-xs w-full sm:w-64"
              />
            </div>

            <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
              <label className="flex items-center space-x-1.5 text-xs font-mono text-rose-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPinned}
                  onChange={(e) => setIsPinned(e.target.checked)}
                  className="rounded bg-rose-950 border-rose-500/40 text-rose-600 focus:ring-0"
                />
                <Pin className="w-3.5 h-3.5" />
                <span>Pin to context</span>
              </label>

              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-700 to-crimson-600 hover:from-rose-600 hover:to-crimson-500 text-white font-mono text-xs font-bold transition-all shadow-[0_0_15px_rgba(225,29,72,0.3)]"
              >
                Save to Memory
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Memory Notes Grid */}
      <div className="space-y-3">
        <h3 className="text-xs font-mono uppercase tracking-wider text-rose-200">
          Saved Memory Notes ({notes.length})
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                note.pinned
                  ? 'glass-panel border-rose-500/40 shadow-[0_0_20px_rgba(225,29,72,0.15)]'
                  : 'glass-card border-rose-500/20'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  {note.pinned ? (
                    <span className="flex items-center space-x-1 text-rose-400 font-bold">
                      <Pin className="w-3 h-3 fill-rose-400" />
                      <span>PINNED MEMORY</span>
                    </span>
                  ) : (
                    <span className="text-rose-400/50">NOTE</span>
                  )}
                  <span className="text-rose-400/50">
                    {new Date(note.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-rose-50 leading-relaxed font-sans">{note.text}</p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-rose-500/15">
                <div className="flex flex-wrap gap-1">
                  {note.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-full bg-rose-950/80 text-[10px] font-mono text-rose-300 border border-rose-500/20"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => handleDeleteNote(note.id)}
                  className="text-rose-400/40 hover:text-red-400 transition-colors p-1"
                  title="Delete note"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
