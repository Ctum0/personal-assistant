'use client';

import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Play,
  Square,
  Plus,
  Trash2,
  Clock,
  Sparkles,
  AlertTriangle,
  Flame,
} from 'lucide-react';
import { TaskItem } from '@/lib/types';

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newEst, setNewEst] = useState(30);

  // Focus Session State
  const [focusActive, setFocusActive] = useState(false);
  const [focusMinutes, setFocusMinutes] = useState(45);
  const [secondsRemaining, setSecondsRemaining] = useState(45 * 60);

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // Timer countdown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (focusActive && secondsRemaining > 0) {
      timer = setInterval(() => {
        setSecondsRemaining((prev) => Math.max(0, prev - 1));
      }, 1000);
    } else if (focusActive && secondsRemaining === 0) {
      setFocusActive(false);
      alert('Focus Block Complete! Sofia noted your completed session.');
    }
    return () => clearInterval(timer);
  }, [focusActive, secondsRemaining]);

  const handleStartFocus = async () => {
    try {
      await fetch('/api/focus/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes: focusMinutes }),
      });
      setSecondsRemaining(focusMinutes * 60);
      setFocusActive(true);
    } catch (err) {
      console.error('Failed to start focus session:', err);
    }
  };

  const handleStopFocus = async () => {
    try {
      await fetch('/api/focus/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: 'interrupted' }),
      });
      setFocusActive(false);
    } catch (err) {
      console.error('Failed to stop focus session:', err);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), est_min: newEst }),
      });
      if (res.ok) {
        setNewTitle('');
        await fetchTasks();
      }
    } catch (err) {
      console.error('Failed to add task:', err);
    }
  };

  const handleToggleTask = async (task: TaskItem) => {
    const nextStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: task.id, status: nextStatus }),
      });
      await fetchTasks();
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const handleDeleteTask = async (id: string) => {
    try {
      await fetch(`/api/tasks?id=${id}`, { method: 'DELETE' });
      await fetchTasks();
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const formatTimer = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4 pb-12">
      {/* Page Title Landmark */}
      <h1 className="sr-only">Tasks, Priorities & Focus Timer</h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Strict Focus Block Timer */}
        <section aria-labelledby="focus-mode-heading" className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-6 rounded-3xl border border-rose-500/25 space-y-5 text-center flex flex-col items-center">
            <div className="flex items-center space-x-2 text-rose-200 font-mono text-xs uppercase tracking-wider font-semibold">
              <Clock className="w-4 h-4 text-rose-400" aria-hidden="true" />
              <h2 id="focus-mode-heading">Strict Focus Session Mode</h2>
            </div>

            {/* Glowing Radial Timer Display */}
            <div className="relative w-56 h-56 flex items-center justify-center my-2" role="timer" aria-live="polite">
              <div
                className={`absolute inset-0 rounded-full blur-2xl transition-all ${
                  focusActive
                    ? 'bg-rose-600/35 animate-pulse-slow'
                    : 'bg-rose-950/20'
                }`}
                aria-hidden="true"
              />
              <div className="relative w-48 h-48 rounded-full border-2 border-rose-500/35 bg-[#16030c]/90 backdrop-blur-xl flex flex-col items-center justify-center shadow-[0_0_30px_rgba(225,29,72,0.25)]">
                <span className="text-4xl font-extrabold font-mono text-white glow-text-burgundy">
                  {formatTimer(secondsRemaining)}
                </span>
                <span className="text-xs font-mono text-rose-300 uppercase mt-1">
                  {focusActive ? 'Deep Focus Active' : 'Ready to Work'}
                </span>
              </div>
            </div>

            {/* Timer Settings / Duration selection */}
            {!focusActive ? (
              <div className="w-full space-y-3">
                <div className="flex items-center justify-center space-x-2 font-mono text-xs">
                  {[25, 45, 60, 90].map((mins) => (
                    <button
                      key={mins}
                      onClick={() => {
                        setFocusMinutes(mins);
                        setSecondsRemaining(mins * 60);
                      }}
                      className={`px-3.5 py-2 rounded-xl border transition-all min-h-[44px] ${
                        focusMinutes === mins
                          ? 'bg-rose-700 text-white border-rose-400 shadow-[0_0_12px_rgba(225,29,72,0.4)] font-bold'
                          : 'bg-rose-950/50 text-rose-200 hover:bg-rose-900/50 border-rose-500/25'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleStartFocus}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-rose-700 to-crimson-600 hover:from-rose-600 hover:to-crimson-500 text-white font-mono text-sm font-bold shadow-[0_0_20px_rgba(225,29,72,0.4)] transition-all flex items-center justify-center space-x-2 min-h-[44px]"
                >
                  <Play className="w-4 h-4 fill-white" aria-hidden="true" />
                  <span>Start Focus Block</span>
                </button>
              </div>
            ) : (
              <div className="w-full space-y-3">
                <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs font-mono text-amber-200 flex items-center space-x-2 text-left">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" aria-hidden="true" />
                  <span>Drift Guard: 20 min continuous leisure triggers Sofia check-in.</span>
                </div>

                <button
                  onClick={handleStopFocus}
                  className="w-full py-3 rounded-xl bg-red-950/80 hover:bg-red-900 border border-red-500/40 text-red-200 font-mono text-xs transition-all flex items-center justify-center space-x-2 min-h-[44px]"
                >
                  <Square className="w-3.5 h-3.5 fill-red-400" aria-hidden="true" />
                  <span>Stop Session</span>
                </button>
              </div>
            )}
          </div>

          {/* Daily Momentum & Streak Card */}
          <div className="glass-card p-6 rounded-3xl border border-rose-500/25 space-y-4">
            <div className="flex items-center space-x-2 text-rose-100 font-mono text-xs font-bold uppercase">
              <Flame className="w-4 h-4 text-rose-400 fill-rose-500/40" aria-hidden="true" />
              <h3 className="font-semibold">Focus Momentum &amp; Streak</h3>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 rounded-2xl bg-rose-950/50 border border-rose-500/20">
                <span className="text-rose-300 block text-[10px]">Today&apos;s Focus</span>
                <span className="text-white font-bold text-lg">3.0h / 5.0h</span>
              </div>
              <div className="p-3 rounded-2xl bg-rose-950/50 border border-rose-500/20">
                <span className="text-rose-300 block text-[10px]">Streak</span>
                <span className="text-white font-bold text-lg">3 Days</span>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Tasks CRUD & Daily Targets */}
        <section aria-labelledby="tasks-heading" className="lg:col-span-7 space-y-6">
          {/* Add Task Card */}
          <div className="glass-panel p-6 rounded-3xl border border-rose-500/25 space-y-4">
            <div className="flex items-center space-x-2 text-rose-100 font-mono text-sm font-bold">
              <CheckSquare className="w-4 h-4 text-rose-400" aria-hidden="true" />
              <h2 id="tasks-heading">Task & Target List</h2>
            </div>

            <form onSubmit={handleAddTask} className="flex flex-col sm:flex-row items-center gap-2">
              <label htmlFor="new-task-title" className="sr-only">
                What must be shipped today?
              </label>
              <input
                id="new-task-title"
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="What must be shipped today?"
                className="flex-1 w-full glass-input px-4 py-2.5 rounded-xl text-xs placeholder:text-rose-300 text-rose-50 min-h-[44px]"
                required
              />
              <div className="flex items-center space-x-2 w-full sm:w-auto">
                <label htmlFor="new-task-est-min" className="sr-only">
                  Estimated duration in minutes
                </label>
                <input
                  id="new-task-est-min"
                  type="number"
                  min={5}
                  max={240}
                  value={newEst}
                  onChange={(e) => setNewEst(Number(e.target.value))}
                  aria-label="Estimated minutes"
                  className="w-20 glass-input px-2.5 py-2.5 rounded-xl text-xs font-mono text-center min-h-[44px]"
                  title="Estimated minutes"
                />
                <span className="text-xs font-mono text-rose-200" aria-hidden="true">m</span>
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-mono text-xs font-bold transition-all shrink-0 flex items-center space-x-1 min-h-[44px]"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Add</span>
                </button>
              </div>
            </form>
          </div>

          {/* Task Items List */}
          <div className="glass-card p-6 rounded-3xl border border-rose-500/25 space-y-3">
            <div className="flex items-center justify-between text-xs font-mono text-rose-200 border-b border-rose-500/20 pb-2">
              <span>Tasks ({tasks.length})</span>
              <span>
                {tasks.filter((t) => t.status === 'completed').length} of {tasks.length} completed
              </span>
            </div>

            <div className="space-y-2 max-h-[28rem] overflow-y-auto pt-1" role="list">
              {tasks.map((task) => {
                const isDone = task.status === 'completed';
                return (
                  <div
                    key={task.id}
                    role="listitem"
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                      isDone
                        ? 'bg-rose-950/20 border-rose-500/15 opacity-65'
                        : 'bg-rose-950/50 border-rose-500/25 hover:border-rose-400/40'
                    }`}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={isDone}
                      onClick={() => handleToggleTask(task)}
                      aria-label={`Mark "${task.title}" as ${isDone ? 'incomplete' : 'completed'}`}
                      className="flex items-center space-x-3 text-left flex-1 min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 rounded-lg p-1"
                    >
                      <div
                        className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                          isDone
                            ? 'bg-emerald-600 border-emerald-400 text-white'
                            : 'border-rose-500/40 hover:border-rose-400'
                        }`}
                        aria-hidden="true"
                      >
                        {isDone && <CheckSquare className="w-3.5 h-3.5" />}
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          isDone ? 'line-through text-rose-300' : 'text-rose-100'
                        }`}
                      >
                        {task.title}
                      </span>
                    </button>

                    <div className="flex items-center space-x-3 text-xs font-mono text-rose-300">
                      <span>{task.est_min}m</span>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        aria-label={`Delete task: ${task.title}`}
                        className="text-rose-400 hover:text-red-400 transition-colors p-2 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center"
                        title="Delete task"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {tasks.length === 0 && (
                <p className="text-xs font-mono text-rose-300 text-center py-8">
                  No tasks logged yet. Add your daily priorities above.
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
