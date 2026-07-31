const User    = require('./models/User');
const Student = require('./models/Student');

const demoUsers = [
  {
    name:     'Admin (Principal Office)',
    email:    'admin@institution.edu',
    password: 'admin123',
    phone:    '+91 99000 00001',
    role:     'admin',
  },
  {
    name:      'Rahul Kumar',
    email:     'rahul.kumar@student.edu',
    password:  'student123',
    phone:     '+91 98765 43210',
    role:      'student',
    studentId: 'STU001',
  },
  {
    name:     'Vikram Singh',
    email:    'vikram.singh@transit.edu',
    password: 'driver123',
    phone:    '+91 97000 10001',
    role:     'driver',
  },
];

// Demo student profile — field names match StudentSchema exactly
const demoStudentProfile = {
  studentId:          'STU001',
  name:               'Rahul Kumar',
  email:              'rahul.kumar@student.edu',
  phone:              '+91 98765 43210',
  department:         'Computer Science',   // ✅ matches StudentSchema
  year:               '3rd Year',
  assignedRoute:      'Route A — Vadlamudi → Vignan LARA',
  assignedBus:        'VL-A01',
  pickupPoint:        'Vadlamudi Bus Stand', // ✅ matches StudentSchema
  predBoardingTime:   '07:32 AM',
  actualBoardingTime: '07:34 AM',
  attendanceStatus:   'Boarded',
};

const seedDemoUsers = async () => {
  try {
    for (const demo of demoUsers) {
      const exists = await User.findOne({ email: demo.email });

      if (!exists) {
        const user = new User(demo);
        await user.save();
        console.log(`✅ Seeded: ${demo.name} (${demo.role})`);

        if (demo.role === 'student') {
          const profileExists = await Student.findOne({ studentId: demoStudentProfile.studentId });
          if (!profileExists) {
            await Student.create(demoStudentProfile);
            console.log(`✅ Seeded student profile: ${demoStudentProfile.studentId}`);
          }
        }
      } else {
        console.log(`ℹ  Already exists: ${demo.email}`);

        // Ensure demo student has a linked profile
        if (demo.role === 'student') {
          const linked = await Student.findOne({
            $or: [{ studentId: demo.studentId }, { email: demo.email }],
          });
          if (!linked) {
            await Student.create(demoStudentProfile);
            console.log(`✅ Linked missing student profile: ${demoStudentProfile.studentId}`);
          }
          // Ensure user.studentId is populated
          if (!exists.studentId) {
            exists.studentId = demoStudentProfile.studentId;
            await exists.save();
          }
        }
      }
    }
  } catch (err) {
    console.error('Seed error:', err.message);
  }
};

module.exports = seedDemoUsers;
