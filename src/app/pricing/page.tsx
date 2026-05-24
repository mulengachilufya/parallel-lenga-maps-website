import { PLANS } from "@/lib/pricing"
import { motion } from "framer-motion"
import { Star, Check, Link, ArrowRight } from "lucide-react"
import { Key, ReactElement, JSXElementConstructor, ReactNode, ReactPortal, AwaitedReactNode } from "react"

      {/* PRICING CARDS */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-6 items-start">
            {PLANS((plan: { id: Key | null | undefined; highlight: any; name: string | number | bigint | boolean | ReactElement<any, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<AwaitedReactNode> | null | undefined; description: string | number | bigint | boolean | ReactElement<any, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<AwaitedReactNode> | null | undefined; color: any; tagline: string | number | bigint | boolean | ReactElement<any, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<AwaitedReactNode> | null | undefined; features: any[]; cta: string | number | bigint | boolean | ReactElement<any, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<AwaitedReactNode> | null | undefined }, i: number) => {
              const priceData = PLANS[plan.id as keyof typeof PLANS]
              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.12 }}
                  className={`relative rounded-2xl overflow-hidden ${
                    plan.highlight ? 'shadow-2xl ring-2 ring-accent' : 'shadow-lg border border-gray-200'
                  } bg-white`}
                >
                  {plan.highlight && (
                    <div className="bg-accent text-navy text-xs font-black uppercase tracking-widest text-center py-2.5 flex items-center justify-center gap-1.5">
                      <Star size={12} fill="currentColor" /> Most Popular <Star size={12} fill="currentColor" />
                    </div>
                  )}

                  <div className="p-7">
                    <div className="mb-5">
                      <h2 className="text-2xl font-black text-navy">{plan.name}</h2>
                      <p className="text-gray-500 text-sm mt-1 leading-snug">{plan.description}</p>
                    </div>

                    {/* Price */}
                    <div className="mb-6 pb-5 border-b border-gray-100">
                      <div className="text-3xl font-black" style={{ color: plan.color }}>
                        {priceData.priceLabel}
                        <span className="text-base font-normal text-gray-400">/mo</span>
                      </div>
                      <div className="text-xs text-green-600 font-semibold mt-2">{plan.tagline}</div>
                    </div>

                    {/* Features */}
                    <ul className="space-y-2.5 mb-7">
                      {plan.features.map((feature, fi) => (
                        <li key={fi} className="flex items-start gap-3">
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ backgroundColor: `${plan.color}20` }}
                          >
                            <Check size={12} style={{ color: plan.color }} strokeWidth={3} />
                          </div>
                          <span className="text-gray-700 text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA Button */}
                    <Link
                      href={planHref(plan.id)}
                      className={`w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                        plan.highlight
                          ? 'bg-accent text-navy hover:bg-yellow-400'
                          : plan.id === 'max'
                          ? 'bg-purple-600 text-white hover:bg-purple-700'
                          : 'bg-primary text-white hover:bg-navy'
                      }`}
                    >
                      {isSignedIn ? 'Continue to payment' : plan.cta}
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>