import mongoose from 'mongoose';
const { Schema, model } = mongoose;
const id = Schema.Types.ObjectId;

export const User = model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  color: { type: String, default: '#6366f1' },
}, { timestamps: true }));

export const Team = model('Team', new Schema({
  name: { type: String, required: true, trim: true },
  owner: { type: id, ref: 'User' },
  members: [{ type: id, ref: 'User' }],
  inviteCode: { type: String, unique: true },
}, { timestamps: true }));

export const Channel = model('Channel', new Schema({
  team: { type: id, ref: 'Team', index: true },
  name: { type: String, trim: true },
  type: { type: String, enum: ['channel', 'dm'], default: 'channel' },
  members: [{ type: id, ref: 'User' }], // only used for DMs
}, { timestamps: true }));

export const Message = model('Message', new Schema({
  channel: { type: id, ref: 'Channel', index: true },
  sender: { type: id, ref: 'User' },
  text: { type: String, default: '' },
  replyTo: { type: id, ref: 'Message' },
  reactions: [{ emoji: String, users: [{ type: id, ref: 'User' }] }],
  edited: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },
}, { timestamps: true }));

export const Doc = model('Doc', new Schema({
  team: { type: id, ref: 'Team', index: true },
  title: { type: String, default: 'Untitled document' },
  content: { type: Schema.Types.Mixed, default: null },
  createdBy: { type: id, ref: 'User' },
  updatedBy: { type: id, ref: 'User' },
}, { timestamps: true, minimize: false }));

export const Deck = model('Deck', new Schema({
  team: { type: id, ref: 'Team', index: true },
  title: { type: String, default: 'Untitled presentation' },
  slides: { type: Schema.Types.Mixed, default: [] },
  createdBy: { type: id, ref: 'User' },
  updatedBy: { type: id, ref: 'User' },
}, { timestamps: true, minimize: false }));
