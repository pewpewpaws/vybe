import { motion } from 'framer-motion'
import { EmptyState } from '@/components/common/EmptyState'

export function LeaderboardPage() {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-5 pt-5 pb-4 shrink-0">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="font-display font-bold text-xl text-white">Top Vibes</h1>
          <p className="font-body text-white/40 text-xs mt-0.5">
            Campus leaderboard data will appear here once live ranking endpoints are available
          </p>
        </motion.div>
      </div>

      <div className="px-5 flex flex-col gap-3 pb-10">
        <EmptyState
          title="No leaderboard data yet"
          description="This screen is ready for real leaderboard results once live ranking data is available."
        />
      </div>
    </div>
  )
}
