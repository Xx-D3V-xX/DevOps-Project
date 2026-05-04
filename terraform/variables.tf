variable "aws_region" {
  description = "AWS region to deploy resources into"
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  description = "Name of the project — used in resource names and tags"
  type        = string
  default     = "codesync"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "subnet_cidr" {
  description = "CIDR block for the public subnet"
  type        = string
  default     = "10.0.1.0/24"
}

variable "availability_zone" {
  description = "Availability zone for the public subnet (must match EC2 and EBS volumes)"
  type        = string
  default     = "ap-south-1a"
}

variable "key_name" {
  description = "Name of the AWS key pair to use for EC2 instances"
  type        = string

  validation {
    condition     = length(var.key_name) > 0
    error_message = "key_name must not be empty — provide the name of an existing EC2 key pair."
  }
}
