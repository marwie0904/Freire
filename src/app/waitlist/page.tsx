"use client";

import { CubeLoader } from "@/components/ui/cube-loader";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useMutation } from "convex/react";
import { api } from "convex/_generated/api";
import { FileText, Sparkles, MessageSquare } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function WaitlistPage() {
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [showThankYouModal, setShowThankYouModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    gradeLevel: "",
    interestedFeature: "",
    joinBetaTesting: false,
    operatingSystems: [] as string[],
  });

  const joinWaitlist = useMutation(api.waitlist.joinWaitlist);

  const handleJoinWaitlist = () => {
    setShowSignupModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await joinWaitlist({
        name: formData.name,
        email: formData.email,
        gradeLevel: formData.gradeLevel || undefined,
        interestedFeature: formData.interestedFeature || undefined,
        joinBetaTesting: formData.joinBetaTesting,
        operatingSystems: formData.operatingSystems.length > 0 ? formData.operatingSystems : undefined,
      });

      setShowSignupModal(false);
      setShowThankYouModal(true);
      setFormData({
        name: "",
        email: "",
        gradeLevel: "",
        interestedFeature: "",
        joinBetaTesting: false,
        operatingSystems: [],
      });
    } catch (error) {
      console.error("Error joining waitlist:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOSToggle = (os: string) => {
    setFormData((prev) => ({
      ...prev,
      operatingSystems: prev.operatingSystems.includes(os)
        ? prev.operatingSystems.filter((item) => item !== os)
        : [...prev.operatingSystems, os],
    }));
  };

  const features = [
    {
      title: "Tests",
      description: "Create and manage comprehensive tests with AI assistance",
      icon: FileText,
      image: "/images/features/tests.png", // Add your screenshot here
    },
    {
      title: "Canvas",
      description: "Collaborate visually with an infinite AI-powered canvas",
      icon: Sparkles,
      image: "/images/features/canvas.png", // Add your screenshot here
    },
    {
      title: "Quick Questions",
      description: "Get instant answers to your learning questions",
      icon: MessageSquare,
      image: "/images/features/quick-questions.png", // Add your screenshot here
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted flex flex-col relative overflow-y-auto">
      {/* Theme Toggle - Top Right */}
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      {/* Top section with hero content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 md:px-12 py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex flex-col items-center max-w-6xl w-full"
        >
          {/* Cube Loader */}
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="pt-8 md:pt-12 pb-8 md:pb-12"
          >
            <CubeLoader size="lg" variant="primary" speed="normal" />
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-5xl md:text-7xl lg:text-8xl font-light tracking-tight text-foreground mb-6"
          >
            Built By Students
            <br />
            <span className="font-normal">For Students</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="text-lg md:text-xl lg:text-2xl text-muted-foreground max-w-3xl mb-12"
          >
            Experience the future of learning with our AI-powered platform
            <br className="hidden md:block" />
            designed to help students succeed.
          </motion.p>

          {/* CTA Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            className="mb-12"
          >
            <Button
              onClick={handleJoinWaitlist}
              size="lg"
              className="text-base md:text-lg px-8 md:px-12 py-6 md:py-7 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
            >
              Join Waitlist
            </Button>
          </motion.div>

          {/* Trust indicators */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.0 }}
            className="flex items-center gap-8 text-sm text-muted-foreground mb-12"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span>AI-Powered</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span>Student-Focused</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span>Affordable & Accurate</span>
            </div>
          </motion.div>

          {/* Coming Soon */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 1.2 }}
            className="text-xs text-muted-foreground"
          >
            Coming Soon
          </motion.div>
        </motion.div>
      </div>

      {/* Feature Screenshots Section - Scrollable */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 1.4 }}
        className="relative z-10 w-full px-6 md:px-12 pb-16"
      >
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-semibold text-center mb-12">
            Explore Our Features
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 1.6 + index * 0.1 }}
                className="bg-card border rounded-lg overflow-hidden hover:shadow-xl transition-all duration-300 hover:scale-105"
              >
                {/* Feature Screenshot */}
                <div className="w-full h-64 bg-gradient-to-br from-primary/10 via-primary/5 to-background relative overflow-hidden">
                  <Image
                    src={feature.image}
                    alt={`${feature.title} screenshot`}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="p-6">
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Signup Modal */}
      <Dialog open={showSignupModal} onOpenChange={setShowSignupModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-2xl">Join the Waitlist</DialogTitle>
            <DialogDescription>
              Be the first to know when we launch. Fill out the form below to
              secure your spot.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Enter your name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                placeholder="Enter your email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gradeLevel">
                Grade Level <span className="text-muted-foreground">(Optional)</span>
              </Label>
              <Select
                value={formData.gradeLevel}
                onValueChange={(value) =>
                  setFormData({ ...formData, gradeLevel: value })
                }
              >
                <SelectTrigger id="gradeLevel">
                  <SelectValue placeholder="Select your grade level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Elementary">Elementary</SelectItem>
                  <SelectItem value="High School">High School</SelectItem>
                  <SelectItem value="Senior High School">
                    Senior High School
                  </SelectItem>
                  <SelectItem value="Under-Graduate">Under-Graduate</SelectItem>
                  <SelectItem value="Post-Graduate">Post-Graduate</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="interestedFeature">
                What Feature are you looking for the most?{" "}
                <span className="text-muted-foreground">(Optional)</span>
              </Label>
              <Select
                value={formData.interestedFeature}
                onValueChange={(value) =>
                  setFormData({ ...formData, interestedFeature: value })
                }
              >
                <SelectTrigger id="interestedFeature">
                  <SelectValue placeholder="Select a feature" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Canvas">Canvas</SelectItem>
                  <SelectItem value="Test Creation">Test Creation</SelectItem>
                  <SelectItem value="Quick Question">
                    Quick Question
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="joinBetaTesting"
                  checked={formData.joinBetaTesting}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, joinBetaTesting: checked as boolean })
                  }
                />
                <div className="space-y-1 leading-none">
                  <Label
                    htmlFor="joinBetaTesting"
                    className="text-sm font-medium cursor-pointer"
                  >
                    JOIN BETA TESTING
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Beta testers will be given free credits + a free month on launch.
                    Note that beta testers will be given surveys and forms to answer for feedback.
                    Beta testers are chosen at random and will be invited via email.
                  </p>
                </div>
              </div>

              {formData.joinBetaTesting && (
                <div className="space-y-2 pl-7 animate-in fade-in-50 slide-in-from-top-2">
                  <Label className="text-sm">
                    Which OS do you use? <span className="text-muted-foreground">(Select all that apply)</span>
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    {["iOS", "Android", "Windows", "Mac", "Others"].map((os) => (
                      <div key={os} className="flex items-center space-x-2">
                        <Checkbox
                          id={`os-${os}`}
                          checked={formData.operatingSystems.includes(os)}
                          onCheckedChange={() => handleOSToggle(os)}
                        />
                        <Label
                          htmlFor={`os-${os}`}
                          className="text-sm font-normal cursor-pointer"
                        >
                          {os}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Joining..." : "Join Waitlist"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Thank You Modal */}
      <Dialog open={showThankYouModal} onOpenChange={setShowThankYouModal}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-2xl text-center">
              Thank You!
            </DialogTitle>
            <DialogDescription className="text-center pt-4">
              We appreciate your interest! You&apos;ve been added to our waitlist.
              We&apos;ll notify you as soon as we launch.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center pt-4">
            <Button onClick={() => setShowThankYouModal(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
