"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import grab from 'grab-url';

const SECTIONS = [
  { id: 1, title: "Profile & Background", questions: [1, 2] },
  { id: 2, title: "Product Fit & Interest", questions: [3, 4, 5, 6] },
  { id: 3, title: "Pricing Expectations", questions: [7, 8] },
]

export default function InvestorSurvey() {
  const router = useRouter()
  const [responses, setResponses] = useState<Record<string, any>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitSuccess, setSubmitSuccess] = useState(false)

  const handleResponseChange = (questionId: string, value: any) => {
    setResponses((prev) => ({ ...prev, [questionId]: value }))
  }

  const handleSubmit = async () => {

      const response = await grab("survey", {
          post: true,
          response: setIsSubmitting,

          // Contact information
          name: responses.name,
          email: responses.email,
          phone: responses.phone,
          organization: responses.organization,
          contactMethod: responses.contactMethod,

          // Essential survey responses
          investorType: responses.q1,
          aum: responses.q2,
          predictionMarketFamiliarity: responses.q3,
          predictionMarketValue: responses.q4,
          aiView: responses.q5,
          explainabilityImportance: responses.q6,
          pricingModel: responses.q7,
          subscriptionRange: responses.q8,
          overallInterest: responses.overallInterest,
          additionalComments: responses.additionalComments,
      })

      // Scroll to top to show success message
      window.scrollTo({ top: 0, behavior: "smooth" })

      // Redirect to homepage after 2 seconds
      setTimeout(() => {
        router.push("/")
      }, 2000)

  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
      {/* Main Content */}
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        {submitSuccess && (
          <Card className="mb-8 backdrop-blur-sm bg-green-50/80 border-green-200/40 shadow-lg">
            <CardContent className="pt-6">
              <div className="text-center space-y-2">
                <h2 className="text-2xl font-bold text-green-900">Thank You!</h2>
                <p className="text-green-800">Your survey has been successfully submitted. We'll be in touch soon!</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-8">
          {/* Section 1: Profile & Background */}
          <Card className="backdrop-blur-sm bg-white/60 border-white/40 shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl text-balance">Profile & Background</CardTitle>
              <CardDescription>Help us understand your investment background.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <QuestionRadio
                id="q1"
                question="1. What best describes your primary role or organization type?"
                options={[
                  "Hedge Fund / Multi-Strategy Fund",
                  "Family Office / Private Wealth Manager",
                  "Proprietary Trading Firm",
                  "Institutional Asset Manager",
                  "Registered Investment Advisor (RIA)",
                  "High-Net-Worth Individual Investor",
                ]}
                value={responses.q1}
                onChange={(value) => handleResponseChange("q1", value)}
                hasOther
              />

              <QuestionRadio
                id="q2"
                question="2. What is your approximate total Assets Under Management (AUM) or portfolio size?"
                options={[
                  "Under $1 million",
                  "$1 million – $10 million",
                  "$10 million – $100 million",
                  "$100 million – $500 million",
                  "$500 million – $1 billion",
                  "Over $1 billion",
                ]}
                value={responses.q2}
                onChange={(value) => handleResponseChange("q2", value)}
              />
            </CardContent>
          </Card>

          {/* Section 2: Product Fit & Interest */}
          <Card className="backdrop-blur-sm bg-white/60 border-white/40 shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl text-balance">Product Fit & Interest</CardTitle>
              <CardDescription>Your perspective on prediction markets and AI-driven trading.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <QuestionRadio
                id="q3"
                question="3. How familiar are you with prediction markets (e.g., Polymarket, Kalshi)?"
                options={[
                  "Not at all familiar",
                  "Somewhat familiar – heard of them but never used",
                  "Moderately familiar – researched or monitored them",
                  "Very familiar – actively trade or monitor",
                  "Expert – regularly use in investment process",
                ]}
                value={responses.q3}
                onChange={(value) => handleResponseChange("q3", value)}
              />

              <QuestionRadio
                id="q4"
                question="4. How valuable do you consider prediction market data as trading signals for equities/ETFs?"
                options={[
                  "Not valuable at all",
                  "Slightly valuable – limited utility",
                  "Moderately valuable – useful supplementary data",
                  "Very valuable – key input for strategies",
                  "Extremely valuable – primary driver of decisions",
                ]}
                value={responses.q4}
                onChange={(value) => handleResponseChange("q4", value)}
              />

              <QuestionRadio
                id="q5"
                question="5. How do you view AI/machine learning in investment decision-making?"
                options={[
                  "Skeptical – prefer traditional analysis",
                  "Cautious – see potential but have concerns",
                  "Open-minded – exploring as complement",
                  "Positive – actively use AI-driven insights",
                  "Highly confident – AI is central to strategy",
                ]}
                value={responses.q5}
                onChange={(value) => handleResponseChange("q5", value)}
              />

              <QuestionRadio
                id="q6"
                question="6. How important is explainability in AI-generated trading signals?"
                options={[
                  "Not important – only care about performance",
                  "Slightly important – prefer some explanation",
                  "Moderately important – want general methodology",
                  "Very important – require detailed explanations",
                  "Critical – need full transparency",
                ]}
                value={responses.q6}
                onChange={(value) => handleResponseChange("q6", value)}
              />
            </CardContent>
          </Card>

          {/* Section 3: Pricing Expectations */}
          <Card className="backdrop-blur-sm bg-white/60 border-white/40 shadow-lg">
            <CardHeader>
              <CardTitle className="text-2xl text-balance">Pricing Expectations</CardTitle>
              <CardDescription>Your preferences for pricing structure.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <QuestionRadio
                id="q7"
                question="7. Which pricing model would you prefer?"
                options={[
                  "Flat monthly subscription",
                  "Performance-based fee only",
                  "Hybrid (subscription + performance fee)",
                  "Per-signal or per-trade fee",
                  "Enterprise/custom pricing",
                ]}
                value={responses.q7}
                onChange={(value) => handleResponseChange("q7", value)}
              />

              <QuestionRadio
                id="q8"
                question="8. What monthly subscription range would you consider reasonable?"
                options={[
                  "Under $100/month",
                  "$100–$500/month",
                  "$500–$2,000/month",
                  "$2,000–$5,000/month",
                  "$5,000+/month",
                ]}
                value={responses.q8}
                onChange={(value) => handleResponseChange("q8", value)}
              />
            </CardContent>
          </Card>
        </div>

        {/* Risk Disclosure */}
        <Card className="backdrop-blur-sm bg-white/60 border-white/40 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-balance">Investment Risk Disclosure</CardTitle>
            <CardDescription>
              Please review the following important risk disclosures before proceeding.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64 overflow-y-auto border border-slate-200 rounded-md p-4 bg-white/80 text-sm space-y-4">
              <div className="font-semibold text-base">
                IT IS IMPORTANT THAT YOU READ AND FULLY UNDERSTAND THE FOLLOWING RISKS OF TRADING AND INVESTING IN
                YOUR SELF-DIRECTED AUTO INVESTMENT BROKER ACCOUNT.
              </div>

              <div>
                <h3 className="font-semibold mb-2">Use of Self-Directed Trading Accounts</h3>
                <p className="mb-2">
                  All Customer Accounts are self-directed. Accordingly, unless Auto Investment Broker clearly
                  identifies a communication as an individualized recommendation, Customers are solely responsible
                  for any and all orders placed in their Accounts and understand that all orders entered by them are
                  based on their own investment decisions or the investment decisions of their duly authorized
                  representative or agent.
                </p>
                <p className="mb-2">Consequently, any Customer of Auto Investment Broker agrees that, unless otherwise agreed to in writing, neither Auto Investment Broker nor any of its employees, agents, principals or representatives:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>provide investment advice in connection with a Customer Account;</li>
                  <li>recommend any security, transaction or order;</li>
                  <li>solicit orders;</li>
                  <li>act as a market maker in any security;</li>
                  <li>make discretionary trades; and</li>
                  <li>
                    produce or provide research. To the extent research materials or similar information is available
                    through autoinvestmentbroker.com or the websites of any of its affiliates, these materials are
                    intended for informational and educational purposes only and they do not constitute a
                    recommendation to enter into any securities transactions or to engage in any investment strategies.
                  </li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold mb-2">General Risks of Trading and Investing</h3>
                <p>
                  All securities trading, whether in stocks, exchange-traded funds ("ETFs"), options, closed-end funds
                  ("CEFs") or other investment vehicles, is speculative in nature and involves substantial risk of
                  loss. Auto Investment Broker encourages its Customers to invest carefully and to use the information
                  available at the websites of the SEC at http://www.sec.gov and FINRA at http://FINRA.org.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">1. You may lose money trading and investing.</h3>
                <p>
                  Trading and investing in securities is always risky. For that reason, Customers should trade or
                  invest only with money they can afford to lose. Trading stocks, ETFs and stock options involves HIGH
                  RISK, and YOU can LOSE a lot of money. Margin trading involves interest charges and additional
                  risks, including the potential to lose more than deposited or the need to deposit additional
                  collateral in a falling market.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">2. Past performance is not necessarily indicative of future results.</h3>
                <p>
                  All investments carry risk, and all trading decisions of an individual remain the responsibility of
                  that individual. There is no guarantee that systems, indicators, or trading signals will result in
                  profits or that they will not result in losses. All Customers are advised to fully understand all
                  risks associated with any kind of trading or investing they choose to do.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">
                  3. Auto Investment Broker is an online brokerage website and affiliated with other non-brokerage
                  informational and other similar types of websites.
                </h3>
                <p>
                  Neither Auto Investment Broker nor its affiliates provide investment advice. All Auto Investment
                  Broker brokerage accounts are self-directed, and unless Auto Investment Broker clearly identifies a
                  communication as an individualized recommendation, all investment decisions are self-directed, the
                  sole responsibility of the Customer, and made at the Customer's own risk.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">4. Stop orders may reduce, but not eliminate, your trading risk.</h3>
                <p>
                  A stop market order is an order, placed with your broker, to buy or sell a particular stock at the
                  market price if and when the price reaches a specified level. There can be no guarantee, however,
                  that it will be possible under all market conditions to execute the order at the price specified. In
                  an active, volatile market, the market price may be declining (or rising) so rapidly that there is no
                  opportunity to liquidate your position at the stop price you have designated.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Risks of Investing in Stocks, ETFs, and CEFs</h3>
                <p className="mb-2">Investments always entail some degree of risk. Be aware that:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>
                    Some investments in stock cannot easily be sold or converted to cash. Check to see if there is any
                    penalty or charge if you must sell an investment quickly.
                  </li>
                  <li>Stock investments are not federally insured against a loss in market value.</li>
                  <li>
                    There is a risk when buying shares of stock that the value of the stock can fall to zero. Short
                    selling involves substantial risk and assumes the seller will be able to buy the stock at a more
                    favorable price than the price at which they sold short.
                  </li>
                  <li>
                    ETFs are subject to risks similar to those of other diversified portfolios. Leveraged and Inverse
                    ETFs may not be suitable for all investors and may increase exposure to volatility through the use
                    of leverage, short sales of securities, derivatives and other complex investment strategies.
                  </li>
                  <li>
                    CEFs involve unique risks. Unlike ETFs, CEFs trade on exchanges at market prices that may be
                    higher ("premium") or lower ("discount") than their net asset value ("NAV"). Many CEFs employ
                    structural or portfolio leverage, which magnifies both gains and losses.
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information & Interest */}
        <Card className="backdrop-blur-sm bg-white/60 border-white/40 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl text-balance">Contact Information</CardTitle>
            <CardDescription>
              We'll get back to you in 1-3 days to schedule a demo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            {/* Overall interest */}
            <div>
              <QuestionRadio
                id="overallInterest"
                question="9. Overall, how interested are you in AI Broker?"
                options={[
                  "Very interested - schedule demo immediately",
                  "Interested - want to learn more",
                  "Somewhat interested - need more info",
                  "Not very interested at this time",
                ]}
                value={responses.overallInterest}
                onChange={(value) => handleResponseChange("overallInterest", value)}
              />
            </div>

            {/* Contact information */}
            <div>
              <Label className="text-base font-medium">
                10. Contact details and preferred communication method
              </Label>
              <div className="mt-4 grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={responses.name || ""}
                    onChange={(e) => handleResponseChange("name", e.target.value)}
                    placeholder="John Doe"
                    className="bg-white/80"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="organization">Organization</Label>
                  <Input
                    id="organization"
                    value={responses.organization || ""}
                    onChange={(e) => handleResponseChange("organization", e.target.value)}
                    placeholder="Your Company"
                    className="bg-white/80"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={responses.email || ""}
                    onChange={(e) => handleResponseChange("email", e.target.value)}
                    placeholder="john@example.com"
                    className="bg-white/80"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={responses.phone || ""}
                    onChange={(e) => handleResponseChange("phone", e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="bg-white/80"
                  />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <Label>Preferred contact method</Label>
                <RadioGroup
                  value={responses.contactMethod}
                  onValueChange={(value) => handleResponseChange("contactMethod", value)}
                >
                  <div className="flex flex-wrap gap-4">
                    {["Email", "Phone", "Video call (Zoom/Teams)", "In-person meeting"].map((method) => (
                      <div key={method} className="flex items-center space-x-2">
                        <RadioGroupItem value={method} id={`contact-${method}`} />
                        <Label htmlFor={`contact-${method}`} className="font-normal cursor-pointer">
                          {method}
                        </Label>
                      </div>
                    ))}
                  </div>
                </RadioGroup>
              </div>
            </div>

            {/* Additional comments */}
            <div>
              <QuestionTextarea
                id="additionalComments"
                question="11. Any additional comments or questions?"
                value={responses.additionalComments}
                onChange={(value) => handleResponseChange("additionalComments", value)}
                placeholder="Share any additional thoughts..."
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center pb-12">
          <Button size="lg" onClick={handleSubmit} className="px-12 shadow-lg" disabled={isSubmitting || submitSuccess}>
            {isSubmitting ? "Submitting..." : submitSuccess ? "Submitted!" : "Submit Survey"}
          </Button>
        </div>
      </main>

      {/* Footer */}
      <footer className="backdrop-blur-md bg-white/70 border-t border-white/20 py-8">
        <div className="container mx-auto px-4 text-center text-sm text-slate-600">
          <p>© 2025 AI Broker. All rights reserved.</p>
          <p className="mt-2">
            Your responses are confidential and will only be used for product development purposes.
          </p>
        </div>
      </footer>
    </div>
  )
}

function QuestionRadio({
  id,
  question,
  options,
  value,
  onChange,
  hasOther = false,
}: {
  id: string
  question: string
  options: string[]
  value: string
  onChange: (value: string) => void
  hasOther?: boolean
}) {
  return (
    <div className="space-y-3">
      <Label className="text-base font-medium">{question}</Label>
      <RadioGroup value={value} onValueChange={onChange}>
        <div className="space-y-2">
          {options.map((option) => (
            <div key={option} className="flex items-start space-x-2">
              <RadioGroupItem value={option} id={`${id}-${option}`} className="mt-0.5" />
              <Label htmlFor={`${id}-${option}`} className="font-normal cursor-pointer leading-relaxed">
                {option}
              </Label>
            </div>
          ))}
          {hasOther && (
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="other" id={`${id}-other`} />
              <Label htmlFor={`${id}-other`} className="font-normal cursor-pointer">
                Other:
              </Label>
              <Input className="max-w-xs bg-white/80" placeholder="Please specify" onClick={() => onChange("other")} />
            </div>
          )}
        </div>
      </RadioGroup>
    </div>
  )
}

function QuestionTextarea({
  id,
  question,
  value,
  onChange,
  placeholder,
}: {
  id: string
  question: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="space-y-3">
      <Label className="text-base font-medium">{question}</Label>
      <Textarea
        id={id}
        rows={5}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="resize-none bg-white/80"
      />
    </div>
  )
}
