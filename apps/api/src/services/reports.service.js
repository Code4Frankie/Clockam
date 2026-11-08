import mongoose from 'mongoose';
import { Attendance } from '../models/Attendance.js';

export function buildSummary({ orgId, from, to }) {
  return Attendance.aggregate([
    { $match: { organization: new mongoose.Types.ObjectId(String(orgId)), date: { $gte: from, $lte: to } } },
    {
      $group: {
        _id: '$user',
        daysPresent: { $sum: 1 },
        daysLate: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
        minutesWorked: { $sum: '$minutesWorked' },
        breakMinutes: { $sum: '$breakMinutes' },
      },
    },
    { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
    { $unwind: '$user' },
    {
      $project: {
        _id: 0,
        userId: '$_id',
        name: '$user.name',
        staffId: '$user.staffId',
        department: '$user.department',
        daysPresent: 1,
        daysLate: 1,
        hoursWorked: { $round: [{ $divide: ['$minutesWorked', 60] }, 2] },
        breakMinutes: 1,
      },
    },
    { $sort: { name: 1 } },
  ]);
}
