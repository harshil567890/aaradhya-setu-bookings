const ceremonies = [
  ['Rudrabhishek Puja', 'Kashi Vishwanath Temple, Varanasi', 2100],
  ['Satyanarayan Katha', 'Satyanarayan Temple, Rishikesh', 1500],
  ['Ganesh Puja', 'Siddhivinayak Temple, Mumbai', 1100],
  ['Mahamrityunjaya Jaap', 'Mahakaleshwar Temple, Ujjain', 3100],
  ['Lakshmi Puja', 'Mahalakshmi Temple, Kolhapur', 1600],
  ['Hanuman Puja', 'Sankat Mochan Temple, Varanasi', 800],
  ['Navagraha Shanti', 'Navagraha Temple, Guwahati', 2500],
  ['Durga Puja', 'Durga Temple, Varanasi', 1800],
];

const names = [
  'Ananya Sharma', 'Rohan Mehta', 'Meera Iyer', 'Arjun Patel', 'Kavya Nair',
  'Vikram Singh', 'Priya Joshi', 'Aditya Rao', 'Sneha Kulkarni', 'Dev Shah',
  'Ishita Das', 'Karan Verma', 'Aditi Menon', 'Nikhil Reddy', 'Diya Gupta',
  'Anirudh Bhat', 'Neha Agarwal', 'Rahul Desai', 'Tara Mukherjee', 'Vihaan Sethi',
  'Swati Kapoor', 'Aryan Jain', 'Pooja Pillai', 'Rishi Malhotra', 'Avni Trivedi',
  'Sameer Arora', 'Nandini Bose', 'Ishan Chawla', 'Shreya Dasgupta', 'Manav Pandey',
  'Tanvi Mishra', 'Vivek Kumar', 'Anika Sinha', 'Pranav Bhatt', 'Smita Ghosh',
  'Sanjay Patil', 'Ira Bansal', 'Aman Saxena', 'Rekha Krishnan', 'Dhruv Naik',
];

const times = ['07:00', '08:30', '10:00', '11:30', '14:00', '16:30'];
const statuses = [
  'Confirmed', 'Pending', 'Confirmed', 'In Progress', 'Completed', 'Pending',
  'In Progress', 'Completed', 'Confirmed', 'Completed', 'Completed', 'Pending',
];

export function sampleBookings() {
  return names.map((devotee, index) => {
    const number = 1048 - index;
    const [puja, temple, amount] = ceremonies[index % ceremonies.length];
    const day = new Date(Date.UTC(2026, 10, 24 - Math.floor((index + 5) / 8)));
    return {
      id: `AS-${number}`,
      devotee,
      email: `${devotee.toLowerCase().replace(' ', '.')}@example.org`,
      phone: `+91 00000 ${String(number).padStart(5, '0')}`,
      puja,
      temple,
      date: day.toISOString().slice(0, 10),
      time: times[index % times.length],
      amount,
      status: statuses[index % statuses.length],
      version: 1,
    };
  });
}
