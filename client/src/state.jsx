import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import { socket, connectSocket, disconnectSocket } from './socket.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(!!localStorage.getItem('token'));
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamIdState] = useState(localStorage.getItem('teamId'));
  const [members, setMembers] = useState([]);
  const [online, setOnline] = useState([]);

  const setTeamId = (id) => {
    localStorage.setItem('teamId', id);
    setTeamIdState(id);
  };

  const loadTeams = useCallback(async () => {
    const list = await api('/teams');
    setTeams(list);
    setTeamIdState((cur) => (list.some((t) => t.id === cur) ? cur : list[0]?.id || null));
    return list;
  }, []);

  const signIn = ({ token, user }) => {
    localStorage.setItem('token', token);
    setUser(user);
  };

  const signOut = () => {
    localStorage.removeItem('token');
    disconnectSocket();
    setUser(null);
    setTeams([]);
    setMembers([]);
  };

  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    api('/auth/me').then(setUser).catch(() => localStorage.removeItem('token')).finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    connectSocket();
    socket.on('presence', setOnline);
    loadTeams().catch(() => {});
    return () => socket.off('presence', setOnline);
  }, [user, loadTeams]);

  useEffect(() => {
    if (!teamId) return setMembers([]);
    api(`/teams/${teamId}/members`).then(setMembers).catch(() => setMembers([]));
  }, [teamId, teams.length]);

  const team = teams.find((t) => t.id === teamId) || null;

  return (
    <Ctx.Provider value={{ user, booting, signIn, signOut, teams, team, teamId, setTeamId, loadTeams, members, online }}>
      {children}
    </Ctx.Provider>
  );
}
