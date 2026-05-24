'use client'

import { PLANS } from "@/lib/pricing"
import { motion } from "framer-motion"

export default function PricingPage() {
  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-3 gap-6 items-start">
          {Object.entries(PLANS).map(([id], i) => {
            return (
              <motion.div
                key={id}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.12 }}
              >
                <div className="bg-white rounded-2xl p-6 border border-gray-200">
                  <p className="font-semibold text-navy capitalize">{id}</p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}